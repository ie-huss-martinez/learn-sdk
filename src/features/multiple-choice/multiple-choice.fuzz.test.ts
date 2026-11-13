import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isLearnError } from "../../core/errors/learn-error.js";
import type { Exercise } from "../../core/model/content.js";
import { createExerciseTypes } from "../../core/model/exercise-type.js";
import { gradeAnswer } from "../../core/operations/grade-answer.js";
import { parseContent } from "../../core/operations/parse-content.js";
import { multipleChoice } from "./multiple-choice.js";

const types = createExerciseTypes([multipleChoice]);
const asContent = (payload: unknown) => ({
  version: 1,
  exercises: [{ id: "q", type: "multiple-choice", payload }],
});

/** Runs `run`, allowing only a result or a LearnError. */
function onlyLearnErrors<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch (error) {
    if (!isLearnError(error)) {
      throw error;
    }
    return undefined;
  }
}

const validQuestion = fc
  .uniqueArray(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ""),
    {
      minLength: 2,
      maxLength: 8,
      selector: (s) => s.normalize("NFC").trim(),
    },
  )
  .chain((choices) =>
    fc.record({
      prompt: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim() !== ""),
      choices: fc.constant(choices),
      correct: fc.nat({ max: choices.length - 1 }),
    }),
  );

describe("multiple choice, under arbitrary input", () => {
  it("validates any value without throwing anything but a LearnError", () => {
    fc.assert(
      fc.property(fc.anything({ withNullPrototype: true, withObjectString: true }), (payload) => {
        onlyLearnErrors(() => parseContent(asContent(payload), { types }));
        onlyLearnErrors(() => parseContent(asContent({ questions: [payload] }), { types }));
      }),
      { numRuns: 500 },
    );
  });

  it("accepts every well-formed payload unchanged", () => {
    fc.assert(
      fc.property(fc.array(validQuestion, { minLength: 1, maxLength: 10 }), (questions) => {
        const parsed = parseContent(asContent({ questions }), { types });
        expect(parsed.exercises[0]?.payload).toEqual({ questions });
      }),
      { numRuns: 200 },
    );
  });

  it("grades any answer consistently, or refuses it with a LearnError", () => {
    fc.assert(
      fc.property(
        fc.array(validQuestion, { minLength: 1, maxLength: 10 }),
        fc.anything(),
        (questions, answer) => {
          const exercise = parseContent(asContent({ questions }), { types })
            .exercises[0] as Exercise;
          for (const candidate of [answer, { selected: answer }]) {
            const grade = onlyLearnErrors(() => gradeAnswer(exercise, candidate, { types }));
            if (grade) {
              expect(grade.max).toBe(questions.length);
              expect(grade.items).toHaveLength(questions.length);
              expect(grade.score).toBe(grade.items.filter(Boolean).length);
              expect(gradeAnswer(exercise, candidate, { types })).toEqual(grade);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("gives full marks exactly for the right selections", () => {
    fc.assert(
      fc.property(fc.array(validQuestion, { minLength: 1, maxLength: 10 }), (questions) => {
        const exercise = parseContent(asContent({ questions }), { types }).exercises[0] as Exercise;
        const right = questions.map((q) => q.correct);
        expect(gradeAnswer(exercise, { selected: right }, { types }).score).toBe(questions.length);
        const wrong = questions.map((q) => (q.correct + 1) % q.choices.length);
        expect(gradeAnswer(exercise, { selected: wrong }, { types }).score).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
