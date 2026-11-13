/**
 * Codes of the issues that validation reports for content and answers
 * (ADR 0002). Each has text under `validation.<code>` in
 * {@link learnMessages}, written for a teacher looking at the field. They
 * never change meaning once released; exercise types add their own as they
 * arrive.
 *
 * - `not-json`: a content string couldn't be parsed as JSON.
 * - `required`: a required field is missing.
 * - `unknown-field`: a field the format doesn't define, including
 *   `__proto__` and `constructor`.
 * - `not-data`: a field is an accessor, such as a getter, instead of a plain
 *   value. Validation never calls it.
 * - `expected-object`, `expected-list`, `expected-text`,
 *   `expected-whole-number`, `expected-yes-no`: a field holds the wrong kind
 *   of value.
 * - `empty-text`: a text field is empty or only spaces.
 * - `too-few`: a list has fewer entries than it needs. `details.minimum`
 *   says how many.
 * - `out-of-range`: an index points past the end of its list, such as a
 *   correct choice that doesn't exist.
 * - `duplicate-id`: two exercises share an id.
 * - `unknown-type`: an exercise's type isn't among the available types.
 *
 * @public
 */
export type LearnIssueCode =
  | "not-json"
  | "required"
  | "unknown-field"
  | "not-data"
  | "expected-object"
  | "expected-list"
  | "expected-text"
  | "expected-whole-number"
  | "expected-yes-no"
  | "empty-text"
  | "too-few"
  | "out-of-range"
  | "duplicate-id"
  | "unknown-type";

/**
 * One problem found while validating content or an answer: where it is,
 * what it is, and the numbers a message needs. It never contains a field's
 * value or a learner's answer (ADR 0003). Paths hold the format's own field
 * names and list positions; only an `unknown-field` path ends with a name
 * taken from the content, cut to {@link MAX_ISSUE_KEY_LENGTH} characters, so
 * the editor can point at it.
 *
 * @example
 * ```ts
 * { path: ["exercises", 3, "payload", "questions", 0, "correct"], code: "out-of-range" }
 * { path: ["exercises", 1, "payload", "questions", 2, "choices"], code: "too-few", details: { minimum: 2 } }
 * ```
 *
 * @public
 */
export interface LearnIssue {
  /** Field names and list positions from the content's root to the problem. */
  readonly path: readonly (string | number)[];
  /** What's wrong. */
  readonly code: LearnIssueCode;
  /** Numbers for the message, such as `minimum`. */
  readonly details?: { readonly [key: string]: number };
}

/**
 * The longest unknown field name an issue's path keeps; longer names are
 * cut, so hostile keys can't make error details large.
 *
 * @public
 */
export const MAX_ISSUE_KEY_LENGTH = 64;
