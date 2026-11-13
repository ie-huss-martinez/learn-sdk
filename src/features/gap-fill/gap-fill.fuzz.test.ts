import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { isLearnError } from "../../core/errors/learn-error.js";
import type { Exercise } from "../../core/model/content.js";
import { createExerciseTypes } from "../../core/model/exercise-type.js";
import type { LanguageProfile } from "../../core/model/language-profile.js";
import { gradeAnswer } from "../../core/operations/grade-answer.js";
import { parseContent } from "../../core/operations/parse-content.js";
import { gapFill } from "./gap-fill.js";

const types = createExerciseTypes([gapFill]);
const thai: LanguageProfile = {
  code: "th",
  direction: "ltr",
  normalizeAnswer: (t) => t.replace(/\s+/g, ""),
};
const asContent = (payload: unknown) => ({
  version: 1,
  exercises: [{ id: "g", type: "gap-fill", payload }],
});

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

const word = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => s.trim() !== "" && !s.includes("___"));
const validItem = fc.record({
  sentence: fc.tuple(word, word).map(([a, b]) => `${a} ___ ${b}`),
  answers: fc.array(word, { minLength: 1, maxLength: 4 }),
});

describe("gap fill, under arbitrary input", () => {
  const intl = globalThis.Intl;
  afterEach(() => {
    globalThis.Intl = intl;
  });

  it("validates any value without throwing anything but a LearnError", () => {
    fc.assert(
      fc.property(fc.anything({ withNullPrototype: true }), (value) => {
        onlyLearnErrors(() => parseContent(asContent(value), { types }));
        onlyLearnErrors(() => parseContent(asContent({ items: [value] }), { types }));
      }),
      { numRuns: 500 },
    );
  });

  it("grades any answer consistently, or refuses it with a LearnError", () => {
    fc.assert(
      fc.property(
        fc.array(validItem, { minLength: 1, maxLength: 8 }),
        fc.anything(),
        (items, answer) => {
          const exercise = parseContent(asContent({ items }), { types }).exercises[0] as Exercise;
          for (const candidate of [answer, { filled: answer }]) {
            const grade = onlyLearnErrors(() =>
              gradeAnswer(exercise, candidate, { types, profile: thai }),
            );
            if (grade) {
              expect(grade.max).toBe(items.length);
              expect(grade.items).toHaveLength(items.length);
              expect(grade.score).toBe(grade.items.filter(Boolean).length);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("accepts every accepted answer, and grades the same without Intl", () => {
    fc.assert(
      fc.property(fc.array(validItem, { minLength: 1, maxLength: 8 }), (items) => {
        const exercise = parseContent(asContent({ items }), { types }).exercises[0] as Exercise;
        const answers = { filled: items.map((item) => item.answers[0] ?? null) };
        const withIntl = gradeAnswer(exercise, answers, { types, profile: thai });
        expect(withIntl.score).toBe(items.length);
        // @ts-expect-error -- removed on purpose: grading must not depend on it.
        delete globalThis.Intl;
        expect(gradeAnswer(exercise, answers, { types, profile: thai })).toEqual(withIntl);
        globalThis.Intl = intl;
      }),
      { numRuns: 200 },
    );
  });
});
