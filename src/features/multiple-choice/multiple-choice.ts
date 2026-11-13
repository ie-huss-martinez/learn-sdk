import type { ExerciseType } from "../../core/model/exercise-type.js";
import { defineExerciseType } from "../../core/model/exercise-type.js";
import type { ValidationContext } from "../../core/model/validation-context.js";

/**
 * One multiple-choice question: a prompt, its choices, the position of the
 * right one, and an optional explanation shown after answering.
 *
 * @public
 */
export interface MultipleChoiceQuestion {
  readonly prompt: string;
  /** 2 to `maxChoices` different choices. */
  readonly choices: readonly string[];
  /** The position of the right choice in `choices`, from 0. */
  readonly correct: number;
  readonly explanation?: string;
}

/**
 * The data of a `multiple-choice` exercise: one or more questions.
 *
 * @public
 */
export interface MultipleChoicePayload {
  readonly questions: readonly MultipleChoiceQuestion[];
}

/**
 * A learner's answer to a `multiple-choice` exercise: for each question, in
 * order, the position of the chosen choice, or `null` if it was left
 * unanswered, which counts as wrong.
 *
 * @public
 */
export interface MultipleChoiceAnswer {
  readonly selected: readonly (number | null)[];
}

/** Compares choices as a learner sees them: NFC, ignoring surrounding spaces. */
const sameChoice = (text: string) => text.normalize("NFC").trim();

function validateQuestion(
  entry: unknown,
  context: ValidationContext,
): MultipleChoiceQuestion | undefined {
  const fields = context.fields(entry, ["prompt", "choices", "correct", "explanation"]);
  if (!fields) {
    return undefined;
  }
  const prompt = context.at("prompt").text(fields.prompt);
  const list = context.at("choices").list(fields.choices, { limit: "maxChoices", minimum: 2 });
  const choices = list?.map((choice, index) => context.at("choices", index).text(choice));
  if (choices) {
    const seen = new Set<string>();
    choices.forEach((choice, index) => {
      if (choice === undefined) {
        return;
      }
      if (seen.has(sameChoice(choice))) {
        context.at("choices", index).issue("duplicate-choice");
      }
      seen.add(sameChoice(choice));
    });
  }
  const correct = context.at("correct").wholeNumber(fields.correct);
  if (correct !== undefined && list && correct >= list.length) {
    context.at("correct").issue("out-of-range");
  }
  const explanation = context.at("explanation").text(fields.explanation, { optional: true });
  if (
    prompt === undefined ||
    !choices ||
    choices.some((choice) => choice === undefined) ||
    correct === undefined ||
    correct >= choices.length
  ) {
    return undefined;
  }
  return {
    prompt,
    choices: choices as string[],
    correct,
    ...(explanation === undefined ? {} : { explanation }),
  };
}

/**
 * The `multiple-choice` exercise type: questions with 2 or more choices, one
 * of them right (ADR 0001). Answers are graded by position, so they grade
 * the same everywhere, whatever the language.
 *
 * Its issues, beyond the generic ones: `duplicate-choice` when two choices
 * of a question read the same, and `out-of-range` when `correct`, or an
 * answer's selection, points past the choices.
 *
 * @example
 * ```ts
 * const types = createExerciseTypes([multipleChoice]);
 * const content = parseContent({
 *   version: 1,
 *   exercises: [{
 *     id: "hot", type: "multiple-choice",
 *     payload: { questions: [{ prompt: "ร้อน means…", choices: ["hot", "cold"], correct: 0 }] },
 *   }],
 * }, { types });
 * gradeAnswer(content.exercises[0], { selected: [0] }, { types }); // { score: 1, max: 1, items: [true] }
 * ```
 *
 * @public
 */
export const multipleChoice: ExerciseType<MultipleChoicePayload, MultipleChoiceAnswer> =
  /* @__PURE__ */ defineExerciseType<MultipleChoicePayload, MultipleChoiceAnswer>({
    type: "multiple-choice",
    validate(payload, context) {
      const fields = context.fields(payload, ["questions"]);
      if (!fields) {
        return undefined;
      }
      const list = context
        .at("questions")
        .list(fields.questions, { limit: "maxItems", minimum: 1 });
      if (!list) {
        return undefined;
      }
      const questions = list.map((entry, index) =>
        validateQuestion(entry, context.at("questions", index)),
      );
      return questions.every((question) => question !== undefined) && questions.length > 0
        ? { questions: questions as MultipleChoiceQuestion[] }
        : undefined;
    },
    validateAnswer(answer, payload, context) {
      const fields = context.fields(answer, ["selected"]);
      if (!fields) {
        return undefined;
      }
      const list = context.at("selected").list(fields.selected, { limit: "maxItems" });
      if (!list) {
        return undefined;
      }
      if (list.length !== payload.questions.length) {
        context.at("selected").issue("out-of-range");
        return undefined;
      }
      let valid = true;
      const selected = list.map((entry, index) => {
        if (entry === null) {
          return null;
        }
        const position = context.at("selected", index).wholeNumber(entry);
        const choices = payload.questions[index]?.choices.length ?? 0;
        if (position === undefined) {
          valid = false;
          return null;
        }
        if (position >= choices) {
          context.at("selected", index).issue("out-of-range");
          valid = false;
          return null;
        }
        return position;
      });
      return valid ? { selected } : undefined;
    },
    grade(payload, answer) {
      const items = payload.questions.map(
        (question, index) => answer.selected[index] === question.correct,
      );
      return { score: items.filter(Boolean).length, max: items.length, items };
    },
  });
