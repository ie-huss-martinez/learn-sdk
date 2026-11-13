import { defineMessages, type MessageValue, plural, sdkCoreMessages } from "@hussmartinez/sdk-core";
import type { LearnErrorCode } from "../core/errors/learn-error.js";
import type { LearnIssueCode } from "../core/errors/learn-issues.js";
import type { LearnLimitName } from "../core/errors/learn-limits.js";

/**
 * The learn SDK's English message catalogue: sdk-core's messages, and text
 * for every {@link LearnErrorCode}, every limit's warning and every
 * {@link LearnIssueCode}. Pass it to `createMessages` from
 * `@hussmartinez/sdk-core`, with the host's locale and overrides. The
 * player's and editor's text joins it as they arrive.
 *
 * Error text is looked up by code, with the error's `details` as
 * parameters, and never taken from `error.message` (ADR 0019). Issue text
 * (`validation.<code>`) is written for a teacher looking at the field the
 * issue's `path` points to.
 *
 * @example
 * ```ts
 * const messages = createMessages(learnMessages, { locale: "en", overrides: props.messages });
 * messages.error(error); // "This content has 3 problems. Fix them, then try again."
 * messages.t("validation.too-few", { minimum: 2 }); // "Add at least 2 entries."
 * ```
 *
 * @public
 */
export const learnMessages = /* @__PURE__ */ defineMessages({
  ...sdkCoreMessages,
  "errors.INVALID_CONTENT": /* @__PURE__ */ plural("count", {
    one: "This content has a problem. Fix it, then try again.",
    other: "This content has {count, number} problems. Fix them, then try again.",
  }),
  "errors.UNSUPPORTED_CONTENT_VERSION":
    "This content was made for a newer version of the app. Update the app, then open it again.",
  "errors.INVALID_ANSWER": "This answer couldn't be checked. Please try again.",
  "errors.AUDIO_UNAVAILABLE": "This recording isn't available right now. Please try again later.",
  "errors.CONTENT_TOO_LARGE":
    "This content is {actual, fileSize}, which is over the {maximum, fileSize} limit. Split it into smaller sets.",
  "errors.TOO_MANY_EXERCISES": /* @__PURE__ */ plural("maximum", {
    one: "A set can have {maximum} exercise. Split the content into smaller sets.",
    other: "A set can have up to {maximum, number} exercises. Split the content into smaller sets.",
  }),
  "errors.TOO_MANY_ITEMS": /* @__PURE__ */ plural("maximum", {
    one: "An exercise can have {maximum} item. Split it into smaller exercises.",
    other: "An exercise can have up to {maximum, number} items. Split it into smaller exercises.",
  }),
  "errors.TOO_MANY_CHOICES": /* @__PURE__ */ plural("maximum", {
    one: "A question can have {maximum} choice.",
    other: "A question can have up to {maximum, number} choices.",
  }),
  "errors.TOO_MANY_TILES": /* @__PURE__ */ plural("maximum", {
    one: "A sentence can have {maximum} word to put in order.",
    other: "A sentence can have up to {maximum, number} words to put in order.",
  }),
  "errors.TEXT_TOO_LONG": /* @__PURE__ */ plural("maximum", {
    one: "A text can be {maximum} character long. Shorten it, then try again.",
    other: "A text can be up to {maximum, number} characters long. Shorten it, then try again.",
  }),
  "errors.FILE_TOO_LARGE":
    "This recording is {actual, fileSize}, which is over the {maximum, fileSize} limit.",
  "warnings.maxFileSize": "This recording is {actual, fileSize}, and may be slow to load.",
  "warnings.maxContentSize": "This content is {actual, fileSize}, and may be slow to open.",
  "warnings.maxExercises": /* @__PURE__ */ plural("actual", {
    one: "This set has {actual} exercise.",
    other: "This set has {actual, number} exercises, and may be slow to open.",
  }),
  "warnings.maxItems": /* @__PURE__ */ plural("actual", {
    one: "This exercise has {actual} item.",
    other: "This exercise has {actual, number} items, and may be long to answer.",
  }),
  "warnings.maxChoices": /* @__PURE__ */ plural("actual", {
    one: "This question has {actual} choice.",
    other: "This question has {actual, number} choices, and may be hard to read on a phone.",
  }),
  "warnings.maxTiles": /* @__PURE__ */ plural("actual", {
    one: "This sentence has {actual} word to put in order.",
    other: "This sentence has {actual, number} words to put in order, and may be hard on a phone.",
  }),
  "warnings.maxTextLength": "This text is long, and may be hard to read on a phone.",
  "validation.not-json": "This isn't valid content: it couldn't be read as JSON.",
  "validation.required": "This is required.",
  "validation.unknown-field":
    "This field isn't part of the content format. Remove it, or check its spelling.",
  "validation.not-data": "This field must hold a plain value, not one that's computed.",
  "validation.expected-object": "This should be a group of fields.",
  "validation.expected-list": "This should be a list.",
  "validation.expected-text": "This should be text.",
  "validation.expected-whole-number": "This should be a whole number, 0 or more.",
  "validation.expected-yes-no": "This should be yes or no.",
  "validation.empty-text": "This can't be empty.",
  "validation.too-few": /* @__PURE__ */ plural("minimum", {
    one: "Add at least {minimum} entry.",
    other: "Add at least {minimum, number} entries.",
  }),
  "validation.out-of-range": "This points to an entry that doesn't exist.",
  "validation.duplicate-id": "Another exercise already uses this id.",
  "validation.unknown-type": "This exercise type isn't available here.",
  "validation.duplicate-choice":
    "Another choice already says the same. Make each choice different.",
  "validation.gap-count": "Write the sentence with exactly one gap, as three underscores: ___",
  "validation.answer-not-in-options":
    "None of the choices is an accepted answer. Add the answer to the choices.",
}) satisfies Record<`errors.${LearnErrorCode}`, MessageValue> &
  Record<`warnings.${LearnLimitName}`, MessageValue> &
  Record<`validation.${LearnIssueCode}`, MessageValue>;

/**
 * The type of {@link learnMessages}, for typing a host's overrides with
 * `MessageOverrides<LearnMessageCatalogue>`.
 *
 * @public
 */
export type LearnMessageCatalogue = typeof learnMessages;
