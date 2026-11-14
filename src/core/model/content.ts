/**
 * Learning content as plain, serialisable data (ADR 0001): a versioned set
 * of exercises, each of a registered type.
 */

/**
 * The name of learn-sdk's content format (ADR 0006).
 *
 * @public
 */
export const CONTENT_FORMAT = "hm-learn-content";

/**
 * The content format's current version. Content of another version is
 * refused with `UNSUPPORTED_FORMAT` until a migration reads it.
 *
 * @public
 */
export const CONTENT_VERSION = 1;

/**
 * One exercise: an id unique in its content, the name of its exercise type,
 * optional title and instructions, and the type's own data.
 *
 * @typeParam Payload - The exercise type's data.
 * @public
 */
export interface Exercise<Payload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly title?: string;
  readonly instructions?: string;
  readonly payload: Payload;
}

/**
 * Validated content, as {@link parseContent} returns it: an
 * `hm-learn-content` document, ready to store or send as it is.
 *
 * @public
 */
export interface Content {
  readonly format: typeof CONTENT_FORMAT;
  readonly version: typeof CONTENT_VERSION;
  readonly exercises: readonly Exercise[];
}

/**
 * The result of grading one answer: points scored out of the maximum, and
 * whether each item was right, so a player can mark them.
 *
 * @public
 */
export interface Grade {
  readonly score: number;
  readonly max: number;
  readonly items: readonly boolean[];
}
