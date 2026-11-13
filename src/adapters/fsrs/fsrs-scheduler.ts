import { dateChrono, defineScheduler, Rating as FsrsRating } from "ts-fsrs";
import { schedulerDesiredRetentionMiddleware } from "ts-fsrs/middlewares";
import { FSRS7_DEFAULT_WEIGHTS, FSRS7Model } from "ts-fsrs/models/fsrs-7";
import { LearnError } from "../../core/errors/learn-error.js";
import type { Rating, Scheduled, SchedulingState } from "../../core/model/scheduling.js";
import type { Scheduler } from "../../core/ports/scheduler.js";

const SCHEDULER = "fsrs";
const MODEL = "FSRS-7";
const VERSION = 1;
const STATES = new Set([0, 1, 2, 3]);
const SCHEDULE_STATUSES = new Set(["new", "learning", "review"]);
const RATINGS = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
} as const satisfies Record<Rating, number>;

/**
 * Options for {@link createFsrsScheduler}.
 *
 * @public
 */
export interface FsrsSchedulerOptions {
  /** The chance of remembering an item when it comes due, between 0 and 1 exclusive. Defaults to 0.9. */
  readonly desiredRetention?: number;
  /** FSRS-7's 34 weights, for example ones optimised for a learner. Defaults to FSRS-7's published defaults. */
  readonly weights?: readonly number[];
}

/** An FSRS-7 card as stored: ts-fsrs's fields, with times as epoch milliseconds. */
interface StoredCard {
  readonly stability: number;
  readonly stabilityFast: number;
  readonly difficulty: number;
  readonly state: number;
  readonly scheduleStatus: string;
  readonly dueAt: number;
  readonly lastReviewAt: number | null;
}

interface FsrsCard {
  stability: number;
  stabilityFast: number;
  difficulty: number;
  state: number;
  scheduleStatus: string;
  dueAt: Date;
  lastReviewAt: Date | null;
}

const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function unsupported(given: SchedulingState | undefined, message: string): LearnError {
  return new LearnError("UNSUPPORTED_SCHEDULING_STATE", message, {
    details: {
      ...(typeof given?.scheduler === "string" ? { scheduler: given.scheduler.slice(0, 64) } : {}),
      ...(typeof given?.model === "string" ? { model: given.model.slice(0, 64) } : {}),
      ...(typeof given?.version === "number" && Number.isFinite(given.version)
        ? { version: given.version }
        : {}),
    },
  });
}

/** Reads a stored card, accepting only data FSRS-7 made: plain numbers, known states, real times. */
function readCard(given: SchedulingState): FsrsCard {
  if (given?.scheduler !== SCHEDULER || given.model !== MODEL || given.version !== VERSION) {
    throw unsupported(given, "This state isn't an FSRS-7 state this release reads.");
  }
  const card = given.card as Partial<Record<keyof StoredCard, unknown>> | null;
  if (
    typeof card !== "object" ||
    card === null ||
    !isNumber(card.stability) ||
    !isNumber(card.stabilityFast) ||
    !isNumber(card.difficulty) ||
    !STATES.has(card.state as number) ||
    typeof card.scheduleStatus !== "string" ||
    !SCHEDULE_STATUSES.has(card.scheduleStatus) ||
    !isTime(card.dueAt) ||
    !(card.lastReviewAt === null || isTime(card.lastReviewAt))
  ) {
    throw unsupported(given, "This FSRS-7 state's card is malformed.");
  }
  return {
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    state: card.state as number,
    scheduleStatus: card.scheduleStatus,
    dueAt: new Date(card.dueAt),
    lastReviewAt: card.lastReviewAt === null ? null : new Date(card.lastReviewAt as number),
  };
}

function toScheduled(card: FsrsCard): Scheduled {
  const stored: StoredCard = {
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    state: card.state,
    scheduleStatus: card.scheduleStatus,
    dueAt: card.dueAt.getTime(),
    lastReviewAt: card.lastReviewAt === null ? null : card.lastReviewAt.getTime(),
  };
  return {
    state: { scheduler: SCHEDULER, model: MODEL, version: VERSION, card: stored },
    due: stored.dueAt,
  };
}

/** ts-fsrs's FSRS-7 scheduler, without fuzzing, with the desired-retention policy. */
function createFsrs7(weights: number[], desiredRetention: number) {
  try {
    return defineScheduler({ model: FSRS7Model, chrono: dateChrono })
      .use(schedulerDesiredRetentionMiddleware)
      .create({ config: { weights, fractionalDays: true, desiredRetention } });
  } catch (error) {
    throw new TypeError("FSRS-7 doesn't accept these options.", { cause: error });
  }
}

/** The card type ts-fsrs's review expects; built from a validated stored card. */
type FsrsInputCard = Parameters<ReturnType<typeof createFsrs7>["review"]>[0]["card"];

function checkNow(now: number): Date {
  if (!isTime(now)) {
    throw new TypeError("now must be a time after the Unix epoch, in milliseconds.");
  }
  return new Date(now);
}

/**
 * A {@link Scheduler} running FSRS-7 through ts-fsrs (ADR 0004): the model
 * is named explicitly, intervals aren't fuzzed, so the same review gives the
 * same due time on a server and in every browser, and states are stored as
 * plain JSON with times in milliseconds.
 *
 * It refuses states from another scheduler, model or version, and malformed
 * cards, with `UNSUPPORTED_SCHEDULING_STATE`; a host then starts the item
 * again with `initial`.
 *
 * @example
 * ```ts
 * const scheduler = createFsrsScheduler({ desiredRetention: 0.9 });
 * const first = scheduler.initial(Date.now());
 * const next = scheduler.review(first.state, "good", Date.now()); // next.due: in a few days
 * ```
 *
 * @param options - Desired retention and weights.
 * @throws `TypeError` for options FSRS-7 doesn't accept.
 * @public
 */
export function createFsrsScheduler(options: FsrsSchedulerOptions = {}): Scheduler {
  const desiredRetention = options.desiredRetention ?? 0.9;
  if (!(desiredRetention > 0 && desiredRetention < 1)) {
    throw new TypeError("desiredRetention must be between 0 and 1.");
  }
  const weights = options.weights ? [...options.weights] : [...FSRS7_DEFAULT_WEIGHTS];
  if (weights.length !== FSRS7_DEFAULT_WEIGHTS.length || !weights.every(isNumber)) {
    throw new TypeError(`FSRS-7 needs ${FSRS7_DEFAULT_WEIGHTS.length} finite weights.`);
  }
  const scheduler = createFsrs7(weights, desiredRetention);
  return {
    id: SCHEDULER,
    initial(now) {
      return toScheduled(scheduler.newCard({ now: checkNow(now) }) as FsrsCard);
    },
    review(given, rating, now) {
      const at = checkNow(now);
      const grade = Object.hasOwn(RATINGS, rating) ? RATINGS[rating] : undefined;
      if (grade === undefined) {
        throw new TypeError(`Unknown rating: ${String(rating).slice(0, 20)}.`);
      }
      const card = readCard(given);
      let result: { card: unknown };
      try {
        result = scheduler.review({ card: card as unknown as FsrsInputCard, grade, now: at });
      } catch (error) {
        throw new LearnError("UNSUPPORTED_SCHEDULING_STATE", "FSRS-7 refused this state.", {
          details: { scheduler: SCHEDULER, model: MODEL, version: VERSION },
          cause: error,
        });
      }
      return toScheduled(result.card as FsrsCard);
    },
  };
}
