import { createStore } from "@hussmartinez/sdk-core";
import { isLearnError, LearnError } from "../errors/learn-error.js";
import type { LearnLimitOverrides } from "../errors/learn-limits.js";
import type { Content, Exercise, Grade } from "../model/content.js";
import type { ExerciseType, ExerciseTypes, ReviewedItem } from "../model/exercise-type.js";
import type { LanguageProfile } from "../model/language-profile.js";
import type { CardRecord, ProgressChange } from "../model/progress.js";
import type { Rating } from "../model/scheduling.js";
import { checkAnswer } from "../operations/grade-answer.js";
import { parseContent } from "../operations/parse-content.js";
import type { ProgressStore } from "../ports/progress-store.js";
import type { Scheduler } from "../ports/scheduler.js";

/**
 * Where an exercise is for the learner: being answered, checked with a
 * grade, or skipped, which counts as neither right nor wrong (ADR 0007).
 *
 * @public
 */
export type PlayerExerciseStatus = "answering" | "checked" | "skipped";

/**
 * One exercise in the player's snapshot.
 *
 * @public
 */
export interface PlayerExerciseState {
  readonly id: string;
  readonly type: string;
  readonly status: PlayerExerciseStatus;
  /** The learner's answer so far, as the exercise's component built it, or `undefined`. */
  readonly draft: unknown;
  /** The grade of the last check, while the exercise is checked. */
  readonly grade: Grade | null;
}

/**
 * Whether the player's changes have reached the progress store: all saved,
 * saving, or a save failed and is waiting for {@link LearnPlayer.retrySave}.
 *
 * @public
 */
export type PlayerSaveState = "idle" | "saving" | "failed";

/**
 * The learner's result once every exercise is checked or skipped.
 *
 * @public
 */
export interface PlayerSummary {
  readonly score: number;
  readonly max: number;
  readonly skipped: number;
}

/**
 * What the player can do now, for its buttons and tools.
 *
 * @public
 */
export interface PlayerAbilities {
  readonly check: boolean;
  readonly next: boolean;
  readonly previous: boolean;
  readonly retry: boolean;
  readonly skip: boolean;
}

/**
 * The player's state, as {@link LearnPlayer.getSnapshot} returns it. A new
 * object after every change, so it can be compared by identity.
 *
 * @public
 */
export interface LearnPlayerSnapshot {
  /** The content, as `parseContent` read it. */
  readonly content: Content;
  /** The current exercise's position in `exercises`. */
  readonly position: number;
  readonly exercises: readonly PlayerExerciseState[];
  /** The result, once every exercise is checked or skipped; `null` before. */
  readonly summary: PlayerSummary | null;
  readonly save: PlayerSaveState;
  readonly can: PlayerAbilities;
}

/**
 * A usage event (ADR 0003): names and counts only, never answers, ids,
 * scores or content text.
 *
 * @public
 */
export type LearnPlayerEvent =
  | {
      readonly type: "exercise_checked";
      /** The exercise's type, such as `"gap-fill"`. */
      readonly exerciseType: string;
      /** How many items the exercise has. */
      readonly items: number;
    }
  | { readonly type: "player_completed"; readonly exercises: number };

/**
 * Settings for {@link createLearnPlayer}.
 *
 * @public
 */
export interface LearnPlayerOptions {
  /** An `hm-learn-content` document, as JSON text or a value, read with `parseContent`. */
  readonly content: unknown;
  readonly types: ExerciseTypes;
  /** The learned language's profile, for grading. Defaults to `defaultLanguageProfile`. */
  readonly profile?: LanguageProfile;
  readonly limits?: LearnLimitOverrides;
  /** Where the learner's progress is saved. Without it, changes only go to `onProgress`. */
  readonly progressStore?: ProgressStore;
  /** The progress store's scope, such as a learner and course. Required with `progressStore`. */
  readonly scope?: string;
  /** Schedules reviews of the items of types that define `reviewItems`. */
  readonly scheduler?: Scheduler;
  /** The time, in milliseconds since the Unix epoch. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Called with each change to the learner's progress, as it's made. */
  readonly onProgress?: (change: ProgressChange) => void;
  readonly onEvent?: (event: LearnPlayerEvent) => void;
  /** Called when saving, loading cards or scheduling fails, with a `LearnError`. */
  readonly onError?: (error: LearnError) => void;
}

/**
 * A learner's player session (ADR 0007), headless: what a player component
 * shows, and the learner's actions. Actions the snapshot's `can` doesn't
 * allow change nothing.
 *
 * @public
 */
export interface LearnPlayer {
  getSnapshot(): LearnPlayerSnapshot;
  subscribe(listener: () => void): () => void;
  /** Replaces the current exercise's draft answer. */
  answer(answer: unknown): void;
  /**
   * Grades the current draft with `gradeAnswer` and records the attempt.
   *
   * @throws `LearnError` with `INVALID_ANSWER` when the draft doesn't fit
   *   its exercise, changing nothing.
   */
  check(): void;
  next(): void;
  previous(): void;
  /** Returns a checked or skipped exercise to answering, with an empty draft. */
  retry(): void;
  skip(): void;
  /** Saves the changes a failed save left, and any since. */
  retrySave(): void;
  /** Resolves once the changes made so far are saved, or saving them failed. */
  settled(): Promise<void>;
  /** Stops saving, and ignores the progress store's later results. */
  dispose(): void;
}

type PlayerCommand =
  | { readonly type: "answer"; readonly answer: unknown }
  | { readonly type: "check"; readonly grade: Grade }
  | { readonly type: "next" | "previous" | "retry" | "skip" }
  | { readonly type: "save"; readonly save: PlayerSaveState };

type PlayerState = Omit<LearnPlayerSnapshot, "summary" | "can">;

const finished = (exercise: PlayerExerciseState) => exercise.status !== "answering";

function abilities(state: PlayerState): PlayerAbilities {
  const current = state.exercises[state.position];
  return {
    check: current?.status === "answering" && current.draft !== undefined,
    next: state.position < state.exercises.length - 1,
    previous: state.position > 0,
    retry: current !== undefined && current.status !== "answering",
    skip: current?.status === "answering",
  };
}

function summarise(exercises: readonly PlayerExerciseState[]): PlayerSummary | null {
  if (!exercises.every(finished)) {
    return null;
  }
  let score = 0;
  let max = 0;
  let skipped = 0;
  for (const exercise of exercises) {
    if (exercise.grade) {
      score += exercise.grade.score;
      max += exercise.grade.max;
    } else {
      skipped += 1;
    }
  }
  return { score, max, skipped };
}

function snapshotOf(state: PlayerState): LearnPlayerSnapshot {
  return { ...state, summary: summarise(state.exercises), can: abilities(state) };
}

/**
 * The player's reducer: pure, and allowed only what `can` allows. Grading
 * happens before it, so a `check` command carries its grade.
 */
function reducePlayer(state: PlayerState, command: PlayerCommand): PlayerState {
  const can = abilities(state);
  const update = (change: Partial<PlayerExerciseState>): PlayerState => ({
    ...state,
    exercises: state.exercises.map((exercise, index) =>
      index === state.position ? { ...exercise, ...change } : exercise,
    ),
  });
  switch (command.type) {
    case "answer":
      return state.exercises[state.position]?.status === "answering"
        ? update({ draft: command.answer })
        : state;
    case "check":
      return can.check ? update({ status: "checked", grade: command.grade }) : state;
    case "next":
      return can.next ? { ...state, position: state.position + 1 } : state;
    case "previous":
      return can.previous ? { ...state, position: state.position - 1 } : state;
    case "retry":
      return can.retry ? update({ status: "answering", draft: undefined, grade: null }) : state;
    case "skip":
      return can.skip ? update({ status: "skipped", draft: undefined }) : state;
    case "save":
      return state.save === command.save ? state : { ...state, save: command.save };
  }
}

/** A queued change, or the review of items whose cards aren't known yet. */
type Job =
  | { readonly kind: "change"; readonly change: ProgressChange }
  | { readonly kind: "review"; readonly items: readonly ReviewedItem[]; readonly at: number };

const RATINGS: ReadonlySet<string> = new Set<Rating>(["again", "hard", "good", "easy"]);

function checkReviewedItems(type: ExerciseType, items: unknown): readonly ReviewedItem[] {
  const valid =
    Array.isArray(items) &&
    items.every(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ReviewedItem).itemId === "string" &&
        (item as ReviewedItem).itemId.trim() !== "" &&
        RATINGS.has((item as ReviewedItem).rating),
    );
  if (!valid) {
    throw new TypeError(`The exercise type "${type.type}" returned invalid reviewed items.`);
  }
  return (items as ReviewedItem[]).map(({ itemId, rating }) => ({ itemId, rating }));
}

const storageError = (error: unknown): LearnError =>
  isLearnError(error)
    ? error
    : new LearnError("STORAGE_UNAVAILABLE", "The progress store failed.", { cause: error });

/**
 * Creates a learner's player session (ADR 0007). It reads the content with
 * `parseContent`, grades with `gradeAnswer`, and records one attempt per
 * check, which goes to `onProgress` at once and to the progress store in
 * order. The learner sees their grade without waiting for storage: a failed
 * save keeps its changes queued, sets `save` to `"failed"` and reports the
 * error, and {@link LearnPlayer.retrySave} tries again.
 *
 * Types that define `reviewItems` also get their items reviewed by the
 * `scheduler`, from the cards in the scope's progress, which the player
 * loads before the first review.
 *
 * @throws `LearnError` when the content is invalid, as `parseContent` does.
 * @throws `TypeError` when `progressStore` is given without `scope`.
 * @public
 */
export function createLearnPlayer(options: LearnPlayerOptions): LearnPlayer {
  const { progressStore, scope, scheduler } = options;
  if (progressStore && (typeof scope !== "string" || scope === "")) {
    throw new TypeError("A player with a progressStore needs a scope.");
  }
  const content = parseContent(options.content, {
    types: options.types,
    ...(options.limits ? { limits: options.limits } : {}),
  });
  const now = options.now ?? Date.now;
  let state: PlayerState = {
    content,
    position: 0,
    exercises: content.exercises.map((exercise) => ({
      id: exercise.id,
      type: exercise.type,
      status: "answering",
      draft: undefined,
      grade: null,
    })),
    save: "idle",
  };
  const store = createStore(snapshotOf(state));
  const dispatch = (command: PlayerCommand) => {
    const next = reducePlayer(state, command);
    if (next !== state) {
      state = next;
      store.set(snapshotOf(state));
    }
  };

  const queue: Job[] = [];
  let cards: Map<string, CardRecord> | undefined;
  let running: Promise<void> | undefined;
  let disposed = false;
  const abort = new AbortController();

  const report = (error: LearnError) => {
    if (!disposed) {
      options.onError?.(error);
    }
  };
  const record = (change: ProgressChange) => {
    options.onProgress?.(change);
    if (progressStore) {
      queue.push({ kind: "change", change });
    }
  };

  async function loadCards(): Promise<Map<string, CardRecord>> {
    const snapshot = progressStore
      ? await progressStore.load(scope as string, { signal: abort.signal })
      : { cards: [] };
    return new Map(snapshot.cards.map((card) => [card.itemId, card]));
  }

  /** Turns a review job into review changes, in place, so a retry never schedules twice. */
  function schedule(
    index: number,
    job: Extract<Job, { kind: "review" }>,
    known: Map<string, CardRecord>,
  ) {
    const changes: Job[] = [];
    for (const { itemId, rating } of job.items) {
      try {
        const from =
          known.get(itemId)?.scheduling ?? (scheduler as Scheduler).initial(job.at).state;
        const scheduled = (scheduler as Scheduler).review(from, rating, job.at);
        const change: ProgressChange = {
          kind: "review",
          itemId,
          rating,
          scheduling: scheduled.state,
          due: scheduled.due,
          at: job.at,
        };
        known.set(itemId, { itemId, scheduling: scheduled.state, due: scheduled.due });
        options.onProgress?.(change);
        if (progressStore) {
          changes.push({ kind: "change", change });
        }
      } catch (error) {
        // Another scheduler's card: leave it as it is, rather than replace it.
        if (!isLearnError(error)) {
          throw error;
        }
        report(error);
      }
    }
    queue.splice(index, 1, ...changes);
  }

  async function drain(): Promise<void> {
    while (queue.length > 0 && !disposed) {
      const reviewAt = queue.findIndex((job) => job.kind === "review");
      if (reviewAt === 0) {
        cards ??= await loadCards();
        if (disposed) {
          return;
        }
        schedule(0, queue[0] as Extract<Job, { kind: "review" }>, cards);
        continue;
      }
      const batch = queue.slice(0, reviewAt === -1 ? queue.length : reviewAt);
      if (progressStore) {
        await progressStore.save(
          scope as string,
          batch.map((job) => (job as Extract<Job, { kind: "change" }>).change),
          { signal: abort.signal },
        );
      }
      queue.splice(0, batch.length);
    }
  }

  function pump(): Promise<void> {
    if (running || disposed || queue.length === 0) {
      return running ?? Promise.resolve();
    }
    dispatch({ type: "save", save: "saving" });
    running = drain().then(
      () => {
        running = undefined;
        if (disposed) {
          return;
        }
        dispatch({ type: "save", save: "idle" });
        if (queue.length > 0) {
          void pump();
        }
      },
      (error: unknown) => {
        running = undefined;
        if (disposed) {
          return;
        }
        dispatch({ type: "save", save: "failed" });
        report(storageError(error));
      },
    );
    return running;
  }

  const current = (): Exercise | undefined => content.exercises[state.position];

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    answer(answer) {
      dispatch({ type: "answer", answer });
    },
    check() {
      const exercise = current();
      const draft = state.exercises[state.position];
      if (!exercise || !draft || !abilities(state).check) {
        return;
      }
      const checked = checkAnswer(exercise, draft.draft, {
        types: options.types,
        ...(options.profile ? { profile: options.profile } : {}),
        ...(options.limits ? { limits: options.limits } : {}),
      });
      const reviewed =
        scheduler && checked.type.reviewItems
          ? checkReviewedItems(
              checked.type,
              checked.type.reviewItems(exercise.payload, checked.answer, checked.grade),
            )
          : [];
      const at = now();
      const wasComplete = snapshotOf(state).summary !== null;
      dispatch({ type: "check", grade: checked.grade });
      record({
        kind: "attempt",
        exerciseId: exercise.id,
        answer: checked.answer,
        grade: checked.grade,
        at,
      });
      if (reviewed.length > 0) {
        queue.push({ kind: "review", items: reviewed, at });
      }
      options.onEvent?.({
        type: "exercise_checked",
        exerciseType: exercise.type,
        items: checked.grade.max,
      });
      if (!wasComplete && store.getSnapshot().summary !== null) {
        options.onEvent?.({ type: "player_completed", exercises: state.exercises.length });
      }
      if (state.save !== "failed") {
        void pump();
      }
    },
    next() {
      dispatch({ type: "next" });
    },
    previous() {
      dispatch({ type: "previous" });
    },
    retry() {
      dispatch({ type: "retry" });
    },
    skip() {
      const wasComplete = snapshotOf(state).summary !== null;
      dispatch({ type: "skip" });
      if (!wasComplete && store.getSnapshot().summary !== null) {
        options.onEvent?.({ type: "player_completed", exercises: state.exercises.length });
      }
    },
    retrySave() {
      if (state.save === "failed") {
        void pump();
      }
    },
    async settled() {
      while (running) {
        await running;
      }
    },
    dispose() {
      disposed = true;
      abort.abort();
    },
  };
}
