/**
 * Text direction of a language's script.
 *
 * @public
 */
export type TextDirection = "ltr" | "rtl";

/**
 * How the SDK treats the language being learned (ADR 0001, ADR 0004). A plain
 * value the host supplies, not a port.
 *
 * - `code` and `direction` mark up text in that language, with `lang` and
 *   `dir`, so assistive technology reads it with the right voice (ADR 0005).
 * - `normalizeAnswer` makes answers that mean the same compare equal, after
 *   the SDK's NFC normalisation: Thai, for example, ignores the spaces
 *   learners type between words. It must be deterministic string
 *   operations, giving the same result on a server and in every browser:
 *   never `Intl`, `Intl.Segmenter`, `localeCompare` or locale-dependent case
 *   mapping.
 * - `segment` splits text into words for display only, such as offering a
 *   sentence's words as tiles in the editor. Grading never calls it, so it
 *   may use `Intl.Segmenter`.
 *
 * @example
 * ```ts
 * const thai: LanguageProfile = {
 *   code: "th",
 *   direction: "ltr",
 *   normalizeAnswer: (text) => text.replace(/\s+/g, ""),
 *   segment: (text) =>
 *     [...new Intl.Segmenter("th", { granularity: "word" }).segment(text)]
 *       .filter((part) => part.isWordLike)
 *       .map((part) => part.segment),
 * };
 * ```
 *
 * @public
 */
export interface LanguageProfile {
  /** The language's BCP 47 tag, such as `"th"`, `"es"` or `"zh-Hant"`. */
  readonly code: string;
  readonly direction: TextDirection;
  /** Deterministic rules applied to answers after NFC, before comparing. */
  readonly normalizeAnswer?: (text: string) => string;
  /** Words of a text, for display only. Never used for grading. */
  readonly segment?: (text: string) => readonly string[];
}

/**
 * The profile used when a host gives none: an undetermined language
 * (`und`), left to right, with no rules beyond NFC.
 *
 * @public
 */
export const defaultLanguageProfile: LanguageProfile = Object.freeze({
  code: "und",
  direction: "ltr",
});

/**
 * Prepares an answer for comparison: NFC normalisation, then the profile's
 * own rules. Every exercise type grades through it, so a server and a
 * browser compare the same strings.
 *
 * @example
 * ```ts
 * normalizeForGrading("café", defaultLanguageProfile) === normalizeForGrading("café", defaultLanguageProfile); // true
 * ```
 *
 * @param text - An answer or an accepted answer.
 * @param profile - The language's profile.
 * @throws `TypeError` if the profile's `normalizeAnswer` returns something
 *   other than a string.
 * @public
 */
export function normalizeForGrading(text: string, profile: LanguageProfile): string {
  const nfc = text.normalize("NFC");
  if (!profile.normalizeAnswer) {
    return nfc;
  }
  const normalized: unknown = profile.normalizeAnswer(nfc);
  if (typeof normalized !== "string") {
    throw new TypeError("A language profile's normalizeAnswer must return a string.");
  }
  return normalized;
}
