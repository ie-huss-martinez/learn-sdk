import type { Rating, Scheduled, SchedulingState } from "../model/scheduling.js";

/**
 * Spaced repetition: when to show an item again (ADR 0001, ADR 0004).
 *
 * Contract, checked by the SDK's contract tests for every adapter:
 * - `initial` and `review` are pure and deterministic: the same arguments
 *   give the same result, on a server and in every browser;
 * - a due time is never before `now`, and better ratings never give an
 *   earlier one;
 * - states survive `JSON.stringify` and `JSON.parse` unchanged in meaning;
 * - `review` refuses a state from another scheduler, model or version with
 *   `UNSUPPORTED_SCHEDULING_STATE`.
 *
 * Times are milliseconds since the Unix epoch.
 *
 * @public
 */
export interface Scheduler {
  /** The scheduler's name, as its states carry it. */
  readonly id: string;
  /** The scheduling of an item seen for the first time at `now`. */
  initial(now: number): Scheduled;
  /** The scheduling after the learner rated the item at `now`. */
  review(state: SchedulingState, rating: Rating, now: number): Scheduled;
}
