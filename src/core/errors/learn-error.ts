import { isSdkError, type SdkCoreErrorCode, SdkError } from "@hussmartinez/sdk-core";

/**
 * Error codes of `@hussmartinez/learn-sdk`: sdk-core's own codes, such as
 * `ABORTED`, `UNSUPPORTED_ENVIRONMENT` and `FILE_TOO_LARGE`, plus the learn
 * SDK's (ADR 0002, ADR 0003). They never change meaning once released.
 *
 * - `INVALID_CONTENT`: content failed validation. `details.issues` lists up to
 *   100 {@link LearnIssue | issues}, each with a `path`, a `code` and
 *   `details`, and `details.count` says how many there are.
 * - `UNSUPPORTED_CONTENT_VERSION`: content has a format `version` this
 *   release doesn't know. `details.version` is the content's version when
 *   it's a number, and `details.supported` lists the versions this release
 *   reads.
 * - `INVALID_ANSWER`: a learner's answer doesn't fit its exercise, such as
 *   a choice that doesn't exist. `details.issues` lists the issues, as for
 *   `INVALID_CONTENT`.
 * - `AUDIO_UNAVAILABLE`: the host's audio source returned nothing for a
 *   clip, or failed. `details` names no reference or URL.
 * - `STORAGE_UNAVAILABLE`: the device's storage refused to read or write, such
 *   as when it's full or disabled in private browsing. The browser's error is
 *   the `cause`.
 * - `UNSUPPORTED_SCHEDULING_STATE`: a scheduler was given a state from another
 *   scheduler, model or format version (ADR 0004). `details` names the
 *   `scheduler`, `model` and `version` it was given, when they're readable.
 * - `CONTENT_TOO_LARGE`: a content string exceeds the `maxContentSize`
 *   limit, before it's parsed.
 * - `TOO_MANY_EXERCISES`: content exceeds the `maxExercises` limit.
 * - `TOO_MANY_ITEMS`: an exercise exceeds the `maxItems` limit.
 * - `TOO_MANY_CHOICES`: an item exceeds the `maxChoices` limit.
 * - `TOO_MANY_TILES`: a word-order item exceeds the `maxTiles` limit.
 * - `TEXT_TOO_LONG`: a string in content or an answer exceeds the
 *   `maxTextLength` limit.
 * - `FILE_TOO_LARGE` (sdk-core): an audio clip exceeds the `maxFileSize`
 *   limit, before it's played.
 *
 * Limit codes carry `details` with the `limit`, its `maximum`, the `actual`
 * value and the `unit`. No code's `details` ever contain content text or a
 * learner's answer (ADR 0003).
 *
 * @public
 */
export type LearnErrorCode =
  | SdkCoreErrorCode
  | "INVALID_CONTENT"
  | "UNSUPPORTED_CONTENT_VERSION"
  | "INVALID_ANSWER"
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
 *   if (isLearnError(error, "INVALID_CONTENT")) {
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
