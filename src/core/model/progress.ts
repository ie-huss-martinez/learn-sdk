import type { Grade } from "./content.js";
import type { Rating, SchedulingState } from "./scheduling.js";

/**
 * One graded attempt at an exercise. It carries the answer, so a host can
 * grade it again on its server, and no learner identity: the host scopes
 * what it stores (ADR 0003).
 *
 * @public
 */
export interface AttemptRecord {
  readonly exerciseId: string;
  readonly answer: unknown;
  readonly grade: Grade;
  /** When, in milliseconds since the Unix epoch. */
  readonly at: number;
}

/**
 * An item's spaced-repetition state and when it's next due.
 *
 * @public
 */
export interface CardRecord {
  readonly itemId: string;
  readonly scheduling: SchedulingState;
  /** Next due, in milliseconds since the Unix epoch. */
  readonly due: number;
}

/**
 * Everything stored for one scope: attempts in the order they were made,
 * and one card per item.
 *
 * @public
 */
export interface ProgressSnapshot {
  readonly attempts: readonly AttemptRecord[];
  readonly cards: readonly CardRecord[];
}

/**
 * One change to progress, as the player reports it through `onProgress` and
 * saves through a {@link ProgressStore}.
 *
 * @public
 */
export type ProgressChange =
  | ({ readonly kind: "attempt" } & AttemptRecord)
  | ({ readonly kind: "review"; readonly rating: Rating } & CardRecord & { readonly at: number });

/**
 * An empty snapshot.
 *
 * @public
 */
export const emptyProgress: ProgressSnapshot = Object.freeze({
  attempts: Object.freeze([]),
  cards: Object.freeze([]),
});

/**
 * Applies changes to a snapshot, in order, and returns a new one: attempts
 * are appended, and a review replaces its item's card. Pure; the snapshot
 * given is left unchanged.
 *
 * @param snapshot - The progress so far.
 * @param changes - New changes, oldest first.
 * @public
 */
export function applyProgressChanges(
  snapshot: ProgressSnapshot,
  changes: readonly ProgressChange[],
): ProgressSnapshot {
  const attempts = [...snapshot.attempts];
  const cards = new Map(snapshot.cards.map((card) => [card.itemId, card]));
  for (const change of changes) {
    if (change.kind === "attempt") {
      attempts.push({
        exerciseId: change.exerciseId,
        answer: change.answer,
        grade: change.grade,
        at: change.at,
      });
    } else {
      cards.set(change.itemId, {
        itemId: change.itemId,
        scheduling: change.scheduling,
        due: change.due,
      });
    }
  }
  return { attempts, cards: [...cards.values()] };
}

/**
 * The name of learn-sdk's progress format (ADR 0006).
 *
 * @public
 */
export const PROGRESS_FORMAT = "hm-learn-progress";

/**
 * The progress format's current version.
 *
 * @public
 */
export const PROGRESS_VERSION = 1;

/**
 * One scope's progress as an `hm-learn-progress` document, ready to store or
 * send as JSON (ADR 0006). Answers and scheduler states are opaque JSON,
 * carried unchanged.
 *
 * @public
 */
export interface ProgressDocument extends ProgressSnapshot {
  readonly format: typeof PROGRESS_FORMAT;
  readonly version: typeof PROGRESS_VERSION;
}

/**
 * Writes a snapshot as an `hm-learn-progress` document. Pure; the snapshot
 * is left unchanged, and opaque values are carried as they are.
 *
 * @public
 */
export function toProgressDocument(snapshot: ProgressSnapshot): ProgressDocument {
  return {
    format: PROGRESS_FORMAT,
    version: PROGRESS_VERSION,
    attempts: snapshot.attempts.map(({ exerciseId, answer, grade, at }) => ({
      exerciseId,
      answer,
      grade: { score: grade.score, max: grade.max, items: [...grade.items] },
      at,
    })),
    cards: snapshot.cards.map(({ itemId, scheduling, due }) => ({
      itemId,
      scheduling: {
        scheduler: scheduling.scheduler,
        model: scheduling.model,
        version: scheduling.version,
        card: scheduling.card,
      },
      due,
    })),
  };
}
