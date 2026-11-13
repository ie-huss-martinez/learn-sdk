import { defineExerciseType } from "../core/model/exercise-type.js";
import { normalizeForGrading } from "../core/model/language-profile.js";

/**
 * A minimal exercise type for tests: questions with accepted answers. The
 * built-in types arrive in their own pull requests.
 */
export interface ShortAnswerPayload {
  readonly questions: readonly { readonly prompt: string; readonly accepted: readonly string[] }[];
}

export const shortAnswer = defineExerciseType<ShortAnswerPayload, readonly string[]>({
  type: "short-answer",
  validate(payload, context) {
    const fields = context.fields(payload, ["questions"]);
    if (!fields) {
      return undefined;
    }
    const list = context.at("questions").list(fields.questions, { limit: "maxItems", minimum: 1 });
    if (!list) {
      return undefined;
    }
    const questions = list.map((entry, index) => {
      const question = context.at("questions", index);
      const qFields = question.fields(entry, ["prompt", "accepted"]);
      if (!qFields) {
        return undefined;
      }
      const prompt = question.at("prompt").text(qFields.prompt);
      const acceptedList = question
        .at("accepted")
        .list(qFields.accepted, { limit: "maxChoices", minimum: 1 });
      const accepted = acceptedList?.map((text, i) => question.at("accepted", i).text(text));
      return prompt !== undefined && accepted?.every((a) => a !== undefined)
        ? { prompt, accepted: accepted as string[] }
        : undefined;
    });
    return questions.every((q) => q !== undefined) ? { questions } : undefined;
  },
  validateAnswer(answer, payload, context) {
    const list = context.list(answer, { limit: "maxItems" });
    if (!list) {
      return undefined;
    }
    if (list.length !== payload.questions.length) {
      context.issue("out-of-range");
      return undefined;
    }
    const texts = list.map((text, i) => context.at(i).text(text, { allowEmpty: true }));
    return texts.every((t) => t !== undefined) ? (texts as string[]) : undefined;
  },
  grade(payload, answer, profile) {
    const items = payload.questions.map((question, i) =>
      question.accepted.some(
        (accepted) =>
          normalizeForGrading(accepted, profile) === normalizeForGrading(answer[i] ?? "", profile),
      ),
    );
    return { score: items.filter(Boolean).length, max: items.length, items };
  },
});
