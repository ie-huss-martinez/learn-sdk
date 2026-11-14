import { isSdkError, type SdkCoreErrorCode, SdkError } from "@hussmartinez/sdk-core";

/**
 * Error codes of `@hussmartinez/learn-sdk`: sdk-core's own codes, such as
 * `ABORTED`, `UNSUPPORTED_ENVIRONMENT` and `FILE_TOO_LARGE`, plus the learn
 * SDK's (ADR 0002, ADR 0003). They never change meaning once released.
 *
 * - `UNSUPPORTED_FORMAT`: a document of another format, or of a format
 *   version this release doesn't read (ADR 0006). `details.reason` is
 *   `unknown-format` or `unknown-format-version`, with the `format` and
 *   `version` found when they're readable, and the `supported` versions.
 * - `INVALID_DOCUMENT`: content or progress that isn't valid (ADR 0006).
 *   `details.reason` is `not-json` or `malformed-document`; for the latter,
 *   `details.issues` lists up to 100 {@link LearnIssue | issues}, each with a
 *   `path`, a `code` and `details`, and `details.count` says how many there
 *   are.
 * - `INVALID_ANSWER`: a learner's answer doesn't fit its exercise, such as
 *   a choice that doesn't exist. `details.reason` is `malformed-answer`, with
 *   `details.issues` and `details.count` as for `INVALID_DOCUMENT`.
 * - `INVALID_COMMAND`: an editor command was refused (ADR 0007).
 *   `details.reason` is a {@link LearnCommandRejection}, and `details.command`
 *   the command's `type` when it's one this release knows.
 * - `AUDIO_UNAVAILABLE`: the host's audio source returned nothing for a
 *   clip, or failed. `details` names no reference or URL.
 * - `STORAGE_UNAVAILABLE`: the device's storage refused to read or write, such
 *   as when it's full or disabled in private browsing. The browser's error is
 *   the `cause`.
 * - `UNSUPPORTED_SCHEDULING_STATE`: a scheduler was given a state from another
 *   scheduler, model or format version, or a malformed one (ADR 0004).
 *   `details.reason` is `unknown-scheduler` or `malformed-state`, and
 *   `details` names the `scheduler`, `model` and `version` given, when they're
 *   readable.
 * - `CONTENT_TOO_LARGE`: a content string exceeds the `maxContentSize`
 *   limit, before it's parsed.
 * - `TOO_MANY_EXERCISES`: content exceeds the `maxExercises` limit.
 * - `TOO_MANY_ITEMS`: an exercise exceeds the `maxItems` limit.
 * - `TOO_MANY_CHOICES`: an item exceeds the `maxChoices` limit.
 * - `TOO_MANY_TILES`: a word-order item exceeds the `maxTiles` limit.
 * - `TEXT_TOO_LONG`: a string in content, an answer or progress exceeds the
 *   `maxTextLength` limit, counted in Unicode code points.
 * - `FILE_TOO_LARGE` (sdk-core): an audio clip exceeds the `maxFileSize`
 *   limit, before it's played.
 *
 * Rejections are compared by `code` and `details.reason`, never by message
 * (sdk-core ADR 0045). Limit codes carry `details` with the `limit`, its
 * `maximum`, the `actual` value and the `unit`; `limit` plays the part of a
 * reason. No code's `details` ever contain content text or a
 * learner's answer (ADR 0003).
 *
 * @public
 */
export type LearnErrorCode =
  | SdkCoreErrorCode
  | "UNSUPPORTED_FORMAT"
  | "INVALID_DOCUMENT"
  | "INVALID_ANSWER"
  | "INVALID_COMMAND"
  | "AUDIO_UNAVAILABLE"
  | "UNSUPPORTED_SCHEDULING_STATE"
  | "STORAGE_UNAVAILABLE"
  | "CONTENT_TOO_LARGE"
  | "TOO_MANY_EXERCISES"
  | "TOO_MANY_ITEMS"
  | "TOO_MANY_CHOICES"
  | "TOO_MANY_TILES"
  | "TEXT_TOO_LONG";

/**
 * Why an editor command was refused, as `details.reason` of an
 * `INVALID_COMMAND` error (ADR 0007). The tokens never change meaning once
 * released.
 *
 * - `malformed-command`: not shaped as its type says: a missing, unknown or
 *   mistyped field, a blank id, or a value that isn't JSON.
 * - `unknown-command`: a `type` this release doesn't know.
 * - `unknown-exercise`: no exercise has the `exerciseId`.
 * - `duplicate-id`: an added exercise's id is taken.
 * - `unknown-type`: an added exercise's type isn't registered.
 * - `position-out-of-range`: `at` or `to` is outside the list.
 * - `text-too-long`: a text, anywhere in the command, over `maxTextLength`,
 *   counted in Unicode code points.
 * - `too-many-exercises`: an addition past `maxExercises`.
 *
 * @public
 */
export type LearnCommandRejection =
  | "malformed-command"
  | "unknown-command"
  | "unknown-exercise"
  | "duplicate-id"
  | "unknown-type"
  | "position-out-of-range"
  | "text-too-long"
  | "too-many-exercises";

/**
 * The error `@hussmartinez/learn-sdk` throws and rejects with, with a stable
 * `code`, structured `details` and the underlying error as `cause`. Show
 * users the text for its code from {@link learnMessages}, never its
 * `message`, which is for developers.
 *
 * @example
 * ```ts
 * try {
 *   content = parseContent(text);
 * } catch (error) {
 *   if (isLearnError(error, "INVALID_DOCUMENT")) {
 *     showIssues(error.details?.issues);
 *   } else {
 *     show(messages.error(error));
 *   }
 * }
 * ```
 *
 * @public
 */
export class LearnError extends SdkError<LearnErrorCode> {
  /** Always `"LearnError"`, which survives minification and serialisation. */
  override readonly name = "LearnError";
}

/**
 * Checks whether a value is a {@link LearnError}, optionally with a given
 * code.
 *
 * Unlike `instanceof`, it recognises errors from another copy of this
 * package or another realm, and errors rebuilt after serialisation, such as
 * a server's grading error sent to the browser.
 *
 * @param value - Any thrown value.
 * @param code - When given, the error must also have this code.
 * @public
 */
export function isLearnError<Code extends LearnErrorCode = LearnErrorCode>(
  value: unknown,
  code?: Code,
): value is LearnError & { readonly code: Code } {
  return isSdkError(value, code) && value.name === "LearnError";
}
