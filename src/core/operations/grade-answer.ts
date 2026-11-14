import { LearnError } from "../errors/learn-error.js";
import { type LearnLimitOverrides, learnLimits } from "../errors/learn-limits.js";
import type { Exercise, Grade } from "../model/content.js";
import type { ExerciseType, ExerciseTypes } from "../model/exercise-type.js";
import { defaultLanguageProfile, type LanguageProfile } from "../model/language-profile.js";
import { createIssueSink, createValidationContext, issueDetails } from "../model/validation.js";

/**
 * Options for {@link gradeAnswer}.
 *
 * @public
 */
export interface GradeAnswerOptions {
  /** The exercise types, including the exercise's. */
  readonly types: ExerciseTypes;
  /** The learned language's profile; {@link defaultLanguageProfile} otherwise. */
  readonly profile?: LanguageProfile;
  /** The host's limit settings, which also bound answers. */
  readonly limits?: LearnLimitOverrides;
}

function isValidGrade(grade: unknown): grade is Grade {
  if (typeof grade !== "object" || grade === null) {
    return false;
  }
  const { score, max, items } = grade as Partial<Grade>;
  return (
    Number.isSafeInteger(score) &&
    Number.isSafeInteger(max) &&
    (score as number) >= 0 &&
    (score as number) <= (max as number) &&
    Array.isArray(items) &&
    items.every((item) => typeof item === "boolean")
  );
}

/**
 * Grades a learner's answer to an exercise from validated content, the same
 * way on a server and in a browser (ADR 0001, ADR 0004). The answer is
 * untrusted: it's validated by the exercise's type first, like content.
 *
 * @example
 * ```ts
 * // On a server: grade what the browser sent, instead of trusting its score.
 * const grade = gradeAnswer(exercise, request.answer, { types, profile: thai });
 * ```
 *
 * @param exercise - An exercise from {@link parseContent}.
 * @param answer - The learner's answer, untrusted.
 * @param options - The exercise types, language profile and limits.
 * @returns The grade, as plain data.
 * @throws `LearnError`: `INVALID_ANSWER` (`malformed-answer`), with
 *   `details.issues`, for an answer that doesn't fit the exercise;
 *   `INVALID_DOCUMENT` with an `unknown-type` issue when the exercise's type
 *   isn't in `types`; and the
 *   limits' codes. `TypeError` if the exercise type returns an invalid grade.
 * @public
 */
export function gradeAnswer(
  exercise: Exercise,
  answer: unknown,
  options: GradeAnswerOptions,
): Grade {
  return checkAnswer(exercise, answer, options).grade;
}

/**
 * What {@link gradeAnswer} does, keeping what the player records: the
 * exercise's type, and the answer as its type validated it.
 *
 * @internal
 */
export interface CheckedAnswer {
  readonly type: ExerciseType;
  readonly answer: unknown;
  readonly grade: Grade;
}

/**
 * Validates and grades an answer, as {@link gradeAnswer} does, and returns
 * the validated answer and the type with the grade.
 *
 * @internal
 */
export function checkAnswer(
  exercise: Exercise,
  answer: unknown,
  options: GradeAnswerOptions,
): CheckedAnswer {
  const type = options.types.get(exercise.type);
  if (!type) {
    throw new LearnError("INVALID_DOCUMENT", "The exercise's type isn't available.", {
      details: {
        reason: "malformed-document",
        count: 1,
        issues: [{ path: ["type"], code: "unknown-type" }],
      },
    });
  }
  const sink = createIssueSink();
  const context = createValidationContext(learnLimits.resolve(options.limits), sink);
  const validAnswer = type.validateAnswer(answer, exercise.payload, context);
  if (sink.count > 0 || validAnswer === undefined) {
    throw new LearnError("INVALID_ANSWER", "The answer doesn't fit its exercise.", {
      details: { reason: "malformed-answer", ...issueDetails(sink) },
    });
  }
  const grade = type.grade(
    exercise.payload,
    validAnswer,
    options.profile ?? defaultLanguageProfile,
  );
  if (!isValidGrade(grade)) {
    throw new TypeError(`The exercise type "${type.type}" returned an invalid grade.`);
  }
  return {
    type,
    answer: validAnswer,
    grade: { score: grade.score, max: grade.max, items: [...grade.items] },
  };
}
