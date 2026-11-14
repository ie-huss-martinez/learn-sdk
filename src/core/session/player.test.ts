import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { shortAnswer } from "../../test/test-types.js";
import { isLearnError, LearnError } from "../errors/learn-error.js";
import { createExerciseTypes, defineExerciseType } from "../model/exercise-type.js";
import {
  applyProgressChanges,
  emptyProgress,
  type ProgressChange,
  type ProgressSnapshot,
} from "../model/progress.js";
import type { SchedulingState } from "../model/scheduling.js";
import type { ProgressStore } from "../ports/progress-store.js";
import type { Scheduler } from "../ports/scheduler.js";
import { createLearnPlayer, type LearnPlayerEvent, type LearnPlayerOptions } from "./player.js";

const MARKER = "MARKER-7f3a";
const AT = 1_767_225_600_000;

/** A self-rated type: the answer is the learner's rating of each card. */
const flashcards = defineExerciseType<{ cards: string[] }, string[]>({
  type: "flashcards",
  validate: (payload) => payload as { cards: string[] },
  validateAnswer: (answer, payload, context) => {
    const list = context.list(answer, { limit: "maxItems" });
    if (!list || list.length !== payload.cards.length) {
      context.issue("out-of-range");
      return undefined;
    }
    return list as string[];
  },
  grade: (_, answer) => ({
    score: answer.length,
    max: answer.length,
    items: answer.map(() => true),
  }),
  reviewItems: (payload, answer) =>
    payload.cards.map((itemId, index) => ({ itemId, rating: answer[index] as "good" })),
});
const types = createExerciseTypes([shortAnswer, flashcards]);

const question = (prompt: string, accepted: string) => ({ prompt, accepted: [accepted] });
const content = {
  format: "hm-learn-content",
  version: 1,
  exercises: [
    { id: "a", type: "short-answer", payload: { questions: [question(`eat ${MARKER}`, "กิน")] } },
    {
      id: "b",
      type: "short-answer",
      payload: { questions: [question("drink", "ดื่ม"), question("rice", "ข้าว")] },
    },
    { id: "c", type: "flashcards", payload: { cards: ["กิน", "ดื่ม"] } },
  ],
};

/** A progress store in memory that records its calls, and can be made to fail. */
function recordingStore(initial: ProgressSnapshot = emptyProgress) {
  let snapshot = initial;
  const calls: { method: string; scope: string; changes?: readonly ProgressChange[] }[] = [];
  const failures: { method: string | undefined; error: unknown }[] = [];
  const fail = (method: string) => {
    const index = failures.findIndex(
      (failure) => failure.method === undefined || failure.method === method,
    );
    if (index !== -1) throw failures.splice(index, 1)[0]?.error;
  };
  const store: ProgressStore = {
    async load(scope) {
      calls.push({ method: "load", scope });
      fail("load");
      return snapshot;
    },
    async save(scope, changes) {
      calls.push({ method: "save", scope, changes });
      fail("save");
      snapshot = applyProgressChanges(snapshot, changes);
    },
    async clear() {},
  };
  return {
    store,
    calls,
    failNext: (error: unknown, method?: "load" | "save") => failures.push({ method, error }),
    get: () => snapshot,
  };
}

/** A scheduler that counts reviews in its card, and refuses others' states. */
const counting: Scheduler = {
  id: "counting",
  initial: (now) => ({
    state: { scheduler: "counting", model: "m", version: 1, card: { n: 0 } },
    due: now,
  }),
  review(state: SchedulingState, _rating, now) {
    if (state.scheduler !== "counting") {
      throw new LearnError("UNSUPPORTED_SCHEDULING_STATE", "Not ours.", {
        details: { reason: "unknown-scheduler" },
      });
    }
    const n = (state.card as { n: number }).n + 1;
    return { state: { ...state, card: { n } }, due: now + n };
  },
};

function setup(overrides: Partial<LearnPlayerOptions> = {}) {
  const progress: ProgressChange[] = [];
  const events: LearnPlayerEvent[] = [];
  const errors: LearnError[] = [];
  const player = createLearnPlayer({
    content,
    types,
    now: () => AT,
    onProgress: (change) => progress.push(change),
    onEvent: (event) => events.push(event),
    onError: (error) => errors.push(error),
    ...overrides,
  });
  return { player, progress, events, errors };
}

describe("createLearnPlayer", () => {
  it("reads the content with parseContent, and needs a scope with a store", () => {
    expect(() => createLearnPlayer({ content: { ...content, version: 2 }, types })).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_FORMAT" }),
    );
    expect(() =>
      createLearnPlayer({ content, types, progressStore: recordingStore().store }),
    ).toThrow(TypeError);
  });

  it("starts at the first exercise, with nothing to check yet", () => {
    const { player } = setup();
    const snapshot = player.getSnapshot();
    expect(snapshot.position).toBe(0);
    expect(snapshot.exercises.map((exercise) => [exercise.id, exercise.status])).toEqual([
      ["a", "answering"],
      ["b", "answering"],
      ["c", "answering"],
    ]);
    expect(snapshot.can).toEqual({
      check: false,
      next: true,
      previous: false,
      retry: false,
      skip: true,
    });
    expect([snapshot.summary, snapshot.save]).toEqual([null, "idle"]);
  });

  it("grades a check, records one attempt with the validated answer, and reports only counts", () => {
    const { player, progress, events } = setup();
    player.answer(["กิน"]);
    expect(player.getSnapshot().can.check).toBe(true);
    player.check();
    const exercise = player.getSnapshot().exercises[0];
    expect([exercise?.status, exercise?.grade]).toEqual([
      "checked",
      { score: 1, max: 1, items: [true] },
    ]);
    expect(progress).toEqual([
      {
        kind: "attempt",
        exerciseId: "a",
        answer: ["กิน"],
        grade: { score: 1, max: 1, items: [true] },
        at: AT,
      },
    ]);
    expect(events).toEqual([{ type: "exercise_checked", exerciseType: "short-answer", items: 1 }]);
  });

  it("throws INVALID_ANSWER for a draft that doesn't fit, and changes nothing", () => {
    const { player, progress, events } = setup();
    player.answer(["one", "two"]);
    const before = player.getSnapshot();
    expect(() => player.check()).toThrow(expect.objectContaining({ code: "INVALID_ANSWER" }));
    expect(player.getSnapshot()).toBe(before);
    expect([progress, events]).toEqual([[], []]);
  });

  it("changes nothing for an action the snapshot doesn't allow", () => {
    const { player, progress } = setup();
    const before = player.getSnapshot();
    player.previous();
    player.check();
    player.retry();
    expect(player.getSnapshot()).toBe(before);
    player.next();
    player.next();
    const last = player.getSnapshot();
    player.next();
    expect(player.getSnapshot()).toBe(last);
    expect(progress).toEqual([]);
  });

  it("retries a checked exercise with an empty draft, keeping the earlier attempt", () => {
    const { player, progress } = setup();
    player.answer(["กับ"]);
    player.check();
    player.retry();
    expect(player.getSnapshot().exercises[0]).toMatchObject({
      status: "answering",
      draft: undefined,
      grade: null,
    });
    player.answer(["กิน"]);
    player.check();
    expect(progress.map((change) => change.kind === "attempt" && change.grade.score)).toEqual([
      0, 1,
    ]);
  });

  it("counts skips as neither right nor wrong, records nothing for them, and completes once", () => {
    const { player, progress, events } = setup();
    player.answer(["กิน"]);
    player.check();
    player.next();
    player.skip();
    player.next();
    player.answer(["good", "easy"]);
    player.check();
    expect(player.getSnapshot().summary).toEqual({ score: 3, max: 3, skipped: 1 });
    expect(
      progress.filter((change) => change.kind === "attempt" && change.exerciseId === "b"),
    ).toEqual([]);
    expect(events.filter((event) => event.type === "player_completed")).toEqual([
      { type: "player_completed", exercises: 3 },
    ]);
    player.retry();
    expect(player.getSnapshot().summary).toBeNull();
  });

  it("never puts answers, ids or content text in events or errors", async () => {
    const { store, failNext } = recordingStore();
    failNext(new Error(MARKER));
    const { player, events, errors } = setup({ progressStore: store, scope: "s" });
    player.answer([MARKER]);
    player.check();
    await player.settled();
    const leaked = JSON.stringify([events, errors.map((error) => [error.code, error.details])]);
    expect(leaked).not.toContain(MARKER);
    expect(leaked).not.toContain('"a"');
  });
});

describe("saving progress", () => {
  it("saves each change to the scope, in order, without the learner waiting", async () => {
    const { store, calls, get } = recordingStore();
    const { player } = setup({ progressStore: store, scope: "learner-1/course-a" });
    player.answer(["กิน"]);
    player.check();
    expect(player.getSnapshot().save).toBe("saving");
    expect(player.getSnapshot().exercises[0]?.status).toBe("checked");
    await player.settled();
    expect(player.getSnapshot().save).toBe("idle");
    expect(calls.map(({ method, scope }) => [method, scope])).toEqual([
      ["save", "learner-1/course-a"],
    ]);
    expect(get().attempts).toHaveLength(1);
  });

  it("keeps the grade when a save fails, reports it, and saves everything on retrySave", async () => {
    const { store, calls, failNext, get } = recordingStore();
    failNext(new LearnError("STORAGE_UNAVAILABLE", "Full."));
    const { player, errors } = setup({ progressStore: store, scope: "s" });
    player.answer(["กิน"]);
    player.check();
    await player.settled();
    expect(player.getSnapshot().save).toBe("failed");
    expect(player.getSnapshot().exercises[0]?.grade?.score).toBe(1);
    expect(errors.map((error) => error.code)).toEqual(["STORAGE_UNAVAILABLE"]);
    player.next();
    player.answer(["ดื่ม", "x"]);
    player.check();
    await player.settled();
    expect(calls).toHaveLength(1);
    player.retrySave();
    await player.settled();
    expect(player.getSnapshot().save).toBe("idle");
    expect(
      calls[1]?.changes?.map((change) => change.kind === "attempt" && change.exerciseId),
    ).toEqual(["a", "b"]);
    expect(get().attempts.map((attempt) => attempt.exerciseId)).toEqual(["a", "b"]);
  });

  it("reports a store's own failure as STORAGE_UNAVAILABLE, with the cause", async () => {
    const { store, failNext } = recordingStore();
    const cause = new Error("quota");
    failNext(cause);
    const { player, errors } = setup({ progressStore: store, scope: "s" });
    player.answer(["กิน"]);
    player.check();
    await player.settled();
    expect(errors[0]).toMatchObject({ code: "STORAGE_UNAVAILABLE", cause });
  });

  it("ignores the store's results after dispose", async () => {
    const { store, failNext } = recordingStore();
    failNext(new Error("late"));
    const { player, errors } = setup({ progressStore: store, scope: "s" });
    player.answer(["กิน"]);
    player.check();
    player.dispose();
    await player.settled();
    expect(errors).toEqual([]);
    expect(player.getSnapshot().save).toBe("saving");
  });
});

describe("spaced repetition", () => {
  const card = (itemId: string, scheduler = "counting") => ({
    itemId,
    scheduling: { scheduler, model: "m", version: 1, card: { n: 4 } },
    due: AT,
  });

  it("reviews a self-rated type's items from their cards, loaded once, after the attempt", async () => {
    const { store, calls, get } = recordingStore({ attempts: [], cards: [card("กิน")] });
    const { player, progress } = setup({ progressStore: store, scope: "s", scheduler: counting });
    player.next();
    player.next();
    player.answer(["good", "hard"]);
    player.check();
    player.retry();
    player.answer(["easy", "easy"]);
    player.check();
    await player.settled();
    expect(calls.filter((call) => call.method === "load")).toHaveLength(1);
    expect(
      progress.map((change) => [
        change.kind,
        change.kind === "review" ? [change.itemId, change.rating, change.due - AT] : null,
      ]),
    ).toEqual([
      ["attempt", null],
      ["attempt", null],
      ["review", ["กิน", "good", 5]],
      ["review", ["ดื่ม", "hard", 1]],
      ["review", ["กิน", "easy", 6]],
      ["review", ["ดื่ม", "easy", 2]],
    ]);
    expect(get().cards.map((saved) => [saved.itemId, saved.due - AT])).toEqual([
      ["กิน", 6],
      ["ดื่ม", 2],
    ]);
  });

  it("never reviews a quiz type, and never calls reviewItems without a scheduler", () => {
    const reviewItems = vi.fn(() => []);
    const rated = defineExerciseType({ ...shortAnswer, reviewItems });
    const { player, progress } = setup({
      types: createExerciseTypes([rated, flashcards]),
      scheduler: counting,
    });
    player.answer(["กิน"]);
    player.check();
    expect(reviewItems).toHaveBeenCalledOnce();
    const { player: plain } = setup({ types: createExerciseTypes([rated, flashcards]) });
    plain.answer(["กิน"]);
    plain.check();
    expect(reviewItems).toHaveBeenCalledOnce();
    expect(progress.map((change) => change.kind)).toEqual(["attempt"]);
  });

  it("leaves another scheduler's card alone, and reports it", async () => {
    const { store } = recordingStore({ attempts: [], cards: [card("กิน", "fsrs")] });
    const { player, progress, errors } = setup({
      progressStore: store,
      scope: "s",
      scheduler: counting,
    });
    player.next();
    player.next();
    player.answer(["good", "good"]);
    player.check();
    await player.settled();
    expect(
      progress.filter((change) => change.kind === "review").map((change) => change.itemId),
    ).toEqual(["ดื่ม"]);
    expect(errors.map((error) => error.code)).toEqual(["UNSUPPORTED_SCHEDULING_STATE"]);
  });

  it("schedules once, even when loading the cards fails and is retried", async () => {
    const { store, failNext, get } = recordingStore();
    const { player, errors } = setup({ progressStore: store, scope: "s", scheduler: counting });
    player.next();
    player.next();
    player.answer(["good", "good"]);
    failNext(new LearnError("STORAGE_UNAVAILABLE", "Offline."), "load");
    player.check();
    await player.settled();
    expect([player.getSnapshot().save, errors.length]).toEqual(["failed", 1]);
    player.retrySave();
    await player.settled();
    expect(get().cards.map((saved) => (saved.scheduling.card as { n: number }).n)).toEqual([1, 1]);
  });

  it("refuses invalid reviewed items from a type before changing anything", () => {
    const broken = defineExerciseType({
      ...flashcards,
      reviewItems: () => [{ itemId: "", rating: "good" as const }],
    });
    const { player, progress } = setup({
      types: createExerciseTypes([shortAnswer, broken]),
      scheduler: counting,
    });
    player.next();
    player.next();
    player.answer(["good", "good"]);
    const before = player.getSnapshot();
    expect(() => player.check()).toThrow(TypeError);
    expect([player.getSnapshot(), progress]).toEqual([before, []]);
  });
});

describe("any sequence of actions", () => {
  const action = fc.oneof(
    fc.constant({ kind: "answer" as const, value: ["กิน"] as unknown }),
    fc.constant({ kind: "answer" as const, value: ["x", "y"] as unknown }),
    fc
      .constantFrom("check", "next", "previous", "retry", "skip")
      .map((kind) => ({ kind, value: undefined })),
  );

  it("keeps the player consistent, and records exactly one attempt per check that grades", () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        const { player, progress } = setup();
        let graded = 0;
        for (const { kind, value } of actions) {
          const before = player.getSnapshot();
          if (kind === "answer") {
            player.answer(value);
          } else if (kind === "check") {
            try {
              player.check();
            } catch (error) {
              expect(isLearnError(error, "INVALID_ANSWER")).toBe(true);
              expect(player.getSnapshot()).toBe(before);
            }
            if (player.getSnapshot() !== before) graded += 1;
          } else {
            player[kind as "next"]();
          }
          const snapshot = player.getSnapshot();
          const current = snapshot.exercises[snapshot.position];
          expect(snapshot.position).toBeGreaterThanOrEqual(0);
          expect(snapshot.position).toBeLessThan(snapshot.exercises.length);
          expect(snapshot.summary !== null).toBe(
            snapshot.exercises.every((e) => e.status !== "answering"),
          );
          for (const exercise of snapshot.exercises) {
            expect(exercise.grade !== null).toBe(exercise.status === "checked");
          }
          if (snapshot.can.check)
            expect([current?.status, current?.draft !== undefined]).toEqual(["answering", true]);
        }
        expect(progress).toHaveLength(graded);
      }),
      { numRuns: 300 },
    );
  });
});
