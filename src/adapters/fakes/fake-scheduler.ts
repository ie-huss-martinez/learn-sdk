import { LearnError } from "../../core/errors/learn-error.js";
import type { Rating, Scheduled, SchedulingState } from "../../core/model/scheduling.js";
import type { Scheduler } from "../../core/ports/scheduler.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Base intervals by rating; each review of a remembered item doubles them. */
const BASE: Readonly<Record<Rating, number>> = {
  again: 10 * MINUTE,
  hard: DAY,
  good: 3 * DAY,
  easy: 7 * DAY,
};

interface FakeCard {
  readonly reviews: number;
}

const state = (card: FakeCard): SchedulingState => ({
  scheduler: "fake",
  model: "doubling",
  version: 1,
  card,
});

/**
 * A `Scheduler` (from `@hussmartinez/learn-sdk`) for tests and demos: simple, fixed intervals that
 * double with each review (10 minutes for "again", then 1, 3 or 7 days).
 * Deterministic, with no dependencies. Use the FSRS adapter for learners.
 *
 * @public
 */
export function createFakeScheduler(): Scheduler {
  const readCard = (given: SchedulingState): FakeCard => {
    const ours = given?.scheduler === "fake" && given.model === "doubling" && given.version === 1;
    const card: unknown = given?.card;
    const reviews =
      typeof card === "object" && card !== null && Object.hasOwn(card, "reviews")
        ? (card as { reviews: unknown }).reviews
        : undefined;
    if (!ours || typeof reviews !== "number" || !Number.isSafeInteger(reviews) || reviews < 0) {
      throw new LearnError(
        "UNSUPPORTED_SCHEDULING_STATE",
        "This state isn't the fake scheduler's.",
        {
          details: {
            reason: ours ? "malformed-state" : "unknown-scheduler",
            ...(typeof given?.scheduler === "string" ? { scheduler: given.scheduler } : {}),
            ...(typeof given?.model === "string" ? { model: given.model } : {}),
            ...(typeof given?.version === "number" ? { version: given.version } : {}),
          },
        },
      );
    }
    return { reviews };
  };
  return {
    id: "fake",
    initial: (now): Scheduled => ({ state: state({ reviews: 0 }), due: now }),
    review(given, rating, now): Scheduled {
      const { reviews } = readCard(given);
      if (rating === "again") {
        return { state: state({ reviews: 0 }), due: now + BASE.again };
      }
      return {
        state: state({ reviews: reviews + 1 }),
        due: now + BASE[rating] * 2 ** Math.min(reviews, 10),
      };
    },
  };
}
