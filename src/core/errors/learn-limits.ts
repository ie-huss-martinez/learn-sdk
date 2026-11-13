import {
  coreLimits,
  defineLimits,
  type FilePolicy,
  type FilePolicyOverrides,
  type Limits,
} from "@hussmartinez/sdk-core";
import { LearnError } from "./learn-error.js";

/**
 * The learn SDK's limit definitions: sdk-core's core limits, with an audio
 * clip's size as `maxFileSize`, plus six for content (ADR 0002).
 *
 * | Limit | Code | Default maximum | Default warning |
 * |---|---|---|---|
 * | `maxContentSize` | `CONTENT_TOO_LARGE` | 2 MB | 512 kB |
 * | `maxExercises` | `TOO_MANY_EXERCISES` | 500 | none |
 * | `maxItems` | `TOO_MANY_ITEMS` | 100 | none |
 * | `maxChoices` | `TOO_MANY_CHOICES` | 8 | none |
 * | `maxTiles` | `TOO_MANY_TILES` | 30 | none |
 * | `maxTextLength` | `TEXT_TOO_LONG` | 2,000 | none |
 * | `maxFileSize` | `FILE_TOO_LARGE` | 5 MB | 1 MB |
 * | `maxFiles` | `TOO_MANY_FILES` | 20 | none |
 * | `maxDecodedSize` | `DECODED_SIZE_TOO_LARGE` | 500 MB | none |
 * | `maxProcessingTime` | `PROCESSING_TIME_EXCEEDED` | 120 s | none |
 *
 * Sizes are decimal: 1 MB is 1,000,000 bytes. `maxContentSize` is a content
 * string's UTF-8 size, checked before parsing. `maxItems` counts an
 * exercise's questions, gaps, sentences, pairs, cards or dialogue lines.
 * `maxTextLength` is in UTF-16 code units, for every string in content and
 * answers, ids and audio references included. `maxFileSize` applies to each
 * audio clip the host's `AudioSource` returns. The SDK opens no files and
 * decodes nothing itself, so it doesn't check `maxFiles`, `maxDecodedSize`
 * or `maxProcessingTime`; they keep sdk-core's defaults.
 *
 * @public
 */
export const learnLimitDefinitions = {
  ...coreLimits,
  maxFileSize: { ...coreLimits.maxFileSize, default: 5_000_000, warning: 1_000_000 },
  maxContentSize: {
    code: "CONTENT_TOO_LARGE",
    unit: "bytes",
    default: 2_000_000,
    warning: 512_000,
  },
  maxExercises: { code: "TOO_MANY_EXERCISES", unit: "count", default: 500 },
  maxItems: { code: "TOO_MANY_ITEMS", unit: "count", default: 100 },
  maxChoices: { code: "TOO_MANY_CHOICES", unit: "count", default: 8 },
  maxTiles: { code: "TOO_MANY_TILES", unit: "count", default: 30 },
  maxTextLength: { code: "TEXT_TOO_LONG", unit: "count", default: 2_000 },
} as const;

/**
 * The type of {@link learnLimitDefinitions}.
 *
 * @public
 */
export type LearnLimitDefinitions = typeof learnLimitDefinitions;

/**
 * The names of the learn SDK's limits.
 *
 * @public
 */
export type LearnLimitName = keyof LearnLimitDefinitions;

/**
 * A host's `limits` setting: a new maximum, or `{ maximum, warning }`, for any
 * of the learn SDK's limits. `Infinity` disables a maximum, which removes a
 * protection against hostile content, or disables a warning. Unknown limit
 * names throw `TypeError` when the setting is resolved.
 *
 * @example
 * ```ts
 * // A school that writes long reading passages.
 * const limits: LearnLimitOverrides = {
 *   maxTextLength: 10_000,
 *   maxContentSize: { maximum: 5e6, warning: 2e6 },
 * };
 * ```
 *
 * @public
 */
export type LearnLimitOverrides = FilePolicyOverrides<LearnLimitDefinitions>;

/**
 * Resolved limits for the learn SDK. Violations throw {@link LearnError}.
 *
 * @public
 */
export type LearnLimitPolicy = FilePolicy<LearnLimitDefinitions>;

/**
 * The learn SDK's limits, ready to resolve a host's `limits` setting.
 * Violations are thrown as {@link LearnError}, with `details` naming the
 * limit.
 *
 * @example
 * ```ts
 * const policy = learnLimits.resolve(props.limits);
 * policy.check("maxExercises", exercises.length); // throws LearnError("TOO_MANY_EXERCISES") above 500
 * ```
 *
 * @public
 */
export const learnLimits: Limits<LearnLimitDefinitions> = /* @__PURE__ */ defineLimits(
  learnLimitDefinitions,
  { errorClass: LearnError },
);
