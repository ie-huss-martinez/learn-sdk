import type { LearnIssueCode } from "../errors/learn-issues.js";

/**
 * Limits that bound a list's length.
 *
 * @public
 */
export type ListLimit = "maxExercises" | "maxItems" | "maxChoices" | "maxTiles";

/**
 * Options for reading a value that may be absent.
 *
 * @public
 */
export interface OptionalOption {
  /** When true, an absent value is fine and reports nothing. */
  readonly optional?: boolean;
}

/**
 * The tools a validator uses to read untrusted content or answers by shape
 * (ADR 0002). Every method reads own data properties only, through their
 * descriptors, so getters are never called; reports issues at this
 * context's path; and returns the checked value, or `undefined` when there
 * was an issue. Limits on counts and lengths throw `LearnError` at once.
 *
 * Exercise types, built in or a host's, receive one in `validate` and
 * `validateAnswer`.
 *
 * @example
 * ```ts
 * validate(payload, context) {
 *   const fields = context.fields(payload, ["prompt", "choices"]);
 *   if (!fields) return undefined;
 *   const prompt = context.at("prompt").text(fields.prompt);
 *   const choices = context.at("choices").list(fields.choices, { limit: "maxChoices", minimum: 2 });
 *   ...
 * }
 * ```
 *
 * @public
 */
export interface ValidationContext {
  /** The path from the content's root to this context's value. */
  readonly path: readonly (string | number)[];
  /** A context for a field name or list position below this one. */
  at(...segments: (string | number)[]): ValidationContext;
  /** Reports an issue at this context's path. */
  issue(code: LearnIssueCode, details?: { readonly [key: string]: number }): void;
  /**
   * Reads an object's fields: it must be a non-array object, every own key
   * must be in `names`, and every field must be plain data. Returns a fresh
   * record with the fields present, or `undefined` if the value isn't an
   * object. Reports `expected-object`, `unknown-field` and `not-data`.
   */
  fields<Name extends string>(
    value: unknown,
    names: readonly Name[],
    options?: OptionalOption,
  ): Partial<Record<Name, unknown>> | undefined;
  /**
   * Reads a list: checks its length against `limit` first (throwing that
   * limit's `LearnError`), then copies its entries, each plain data, into a
   * fresh array. Reports `expected-list`, `too-few` and `not-data`.
   */
  list(
    value: unknown,
    options: { readonly limit: ListLimit; readonly minimum?: number } & OptionalOption,
  ): readonly unknown[] | undefined;
  /**
   * Reads a text: a string within `maxTextLength`, not empty or only spaces
   * unless `allowEmpty`. Reports `required`, `expected-text` and
   * `empty-text`.
   */
  text(
    value: unknown,
    options?: { readonly allowEmpty?: boolean } & OptionalOption,
  ): string | undefined;
  /** Reads a whole number, 0 or more. Reports `required` and `expected-whole-number`. */
  wholeNumber(value: unknown, options?: OptionalOption): number | undefined;
  /** Reads `true` or `false`. Reports `required` and `expected-yes-no`. */
  yesNo(value: unknown, options?: OptionalOption): boolean | undefined;
}
