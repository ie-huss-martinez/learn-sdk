import type { Grade } from "./content.js";
import type { LanguageProfile } from "./language-profile.js";
import type { Rating } from "./scheduling.js";
import type { ValidationContext } from "./validation-context.js";

/**
 * An exercise type: how its data and its answers are validated, and how an
 * answer is graded (ADR 0001). All three functions are pure, with no I/O,
 * so the same code validates and grades on a server and in a browser.
 *
 * - `validate` reads untrusted data through the {@link ValidationContext},
 *   by shape, and returns it rebuilt from the fields it checked, or
 *   `undefined` after reporting issues.
 * - `validateAnswer` does the same for a learner's answer, given the
 *   validated data.
 * - `grade` scores a validated answer. It compares text only through
 *   {@link normalizeForGrading}, never `Intl` (ADR 0004).
 * - `reviewItems`, optional, gives the items a checked answer reviewed, for
 *   spaced repetition (ADR 0007). It's for types whose items the learner
 *   rates, such as flashcards; quiz types leave it out, unless a host
 *   decides how their grades become ratings.
 *
 * @typeParam Payload - The type's validated data.
 * @typeParam Answer - The type's validated answer.
 * @public
 */
export interface ExerciseType<Payload = unknown, Answer = unknown> {
  /** The name content uses in an exercise's `type`, such as `"multiple-choice"`. */
  readonly type: string;
  validate(payload: unknown, context: ValidationContext): Payload | undefined;
  validateAnswer(answer: unknown, payload: Payload, context: ValidationContext): Answer | undefined;
  grade(payload: Payload, answer: Answer, profile: LanguageProfile): Grade;
  reviewItems?(payload: Payload, answer: Answer, grade: Grade): readonly ReviewedItem[];
}

/**
 * An item a checked answer reviewed, and how the learner rated it, as
 * {@link ExerciseType.reviewItems} returns it.
 *
 * @public
 */
export interface ReviewedItem {
  /** The item's id, which its card in the learner's progress is kept under. */
  readonly itemId: string;
  readonly rating: Rating;
}

/**
 * A set of exercise types, by name, as {@link createExerciseTypes} returns
 * it.
 *
 * @public
 */
export type ExerciseTypes = ReadonlyMap<string, ExerciseType>;

const TYPE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_TYPE_NAME_LENGTH = 40;

/**
 * Defines an exercise type, checking its name: lowercase words joined by
 * hyphens, up to 40 characters, such as `"word-order"`.
 *
 * @example
 * ```ts
 * export const trueOrFalse = defineExerciseType<{ statement: string; answer: boolean }, boolean>({
 *   type: "true-or-false",
 *   validate(payload, context) {
 *     const fields = context.fields(payload, ["statement", "answer"]);
 *     const statement = fields && context.at("statement").text(fields.statement);
 *     const answer = fields && context.at("answer").yesNo(fields.answer);
 *     return statement !== undefined && answer !== undefined ? { statement, answer } : undefined;
 *   },
 *   validateAnswer: (answer, _payload, context) => context.yesNo(answer),
 *   grade: (payload, answer) => {
 *     const right = answer === payload.answer;
 *     return { score: right ? 1 : 0, max: 1, items: [right] };
 *   },
 * });
 * ```
 *
 * @param definition - The type's name and functions.
 * @returns The same definition, frozen.
 * @throws `TypeError` for an invalid name or a missing function.
 * @public
 */
export function defineExerciseType<Payload, Answer>(
  definition: ExerciseType<Payload, Answer>,
): ExerciseType<Payload, Answer> {
  if (
    typeof definition.type !== "string" ||
    definition.type.length > MAX_TYPE_NAME_LENGTH ||
    !TYPE_NAME.test(definition.type)
  ) {
    throw new TypeError(
      `Exercise type names are lowercase words joined by hyphens, up to ${MAX_TYPE_NAME_LENGTH} characters.`,
    );
  }
  for (const name of ["validate", "validateAnswer", "grade"] as const) {
    if (typeof definition[name] !== "function") {
      throw new TypeError(`The exercise type "${definition.type}" needs a ${name} function.`);
    }
  }
  if (definition.reviewItems !== undefined && typeof definition.reviewItems !== "function") {
    throw new TypeError(`The exercise type "${definition.type}"'s reviewItems must be a function.`);
  }
  return Object.freeze({ ...definition });
}

/**
 * Collects exercise types into the set that {@link parseContent} and
 * {@link gradeAnswer} accept.
 *
 * @param types - Built-in types and the host's own.
 * @throws `TypeError` if two types share a name.
 * @public
 */
export function createExerciseTypes(
  types: readonly ExerciseType<unknown, unknown>[],
): ExerciseTypes {
  const byName = new Map<string, ExerciseType>();
  for (const type of types) {
    if (byName.has(type.type)) {
      throw new TypeError(`Two exercise types are named "${type.type}".`);
    }
    byName.set(type.type, type);
  }
  return byName;
}
