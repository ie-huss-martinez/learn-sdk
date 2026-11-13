/**
 * How well a learner remembered an item: forgot it, hard, good or easy.
 *
 * @public
 */
export type Rating = "again" | "hard" | "good" | "easy";

/**
 * A scheduler's state for one item: opaque to the rest of the SDK, versioned
 * so stored state can be migrated or refused when a scheduler changes
 * (ADR 0004). It's plain JSON, safe to store and send.
 *
 * @public
 */
export interface SchedulingState {
  /** The scheduler that made it, such as `"fsrs"`. */
  readonly scheduler: string;
  /** Its model, such as `"FSRS-7"`. */
  readonly model: string;
  /** Its format version. */
  readonly version: number;
  /** The scheduler's own data, as plain JSON. */
  readonly card: unknown;
}

/**
 * An item's scheduling after a step: its new state, and when it's next due,
 * in milliseconds since the Unix epoch.
 *
 * @public
 */
export interface Scheduled {
  readonly state: SchedulingState;
  readonly due: number;
}
