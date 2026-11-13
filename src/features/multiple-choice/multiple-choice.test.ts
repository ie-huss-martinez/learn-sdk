import { describe, expect, it } from "vitest";
import { isLearnError } from "../../core/errors/learn-error.js";
import { createExerciseTypes } from "../../core/model/exercise-type.js";
import { gradeAnswer } from "../../core/operations/grade-answer.js";
import { parseContent } from "../../core/operations/parse-content.js";
import { multipleChoice } from "./multiple-choice.js";

const types = createExerciseTypes([multipleChoice]);
const question = (overrides: Record<string, unknown> = {}) => ({
  prompt: "ร้อน means…",
  choices: ["hot", "cold", "tired"],
  correct: 0,
  ...overrides,
});
const content = (questions: unknown[]) => ({
  version: 1,
  exercises: [{ id: "q", type: "multiple-choice", payload: { questions } }],
});

function failure(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (isLearnError(error)) {
      return error as unknown as {
        code: string;
        details: { issues: { path: unknown[]; code: string }[] };
      };
    }
    throw error;
  }
  throw new Error("expected a LearnError");
}
const issuesOf = (questions: unknown[]) =>
  failure(() => parseContent(content(questions), { types })).details.issues.map((issue) => [
    issue.path.slice(4).join("."),
    issue.code,
  ]);

describe("multiple choice: content", () => {
  it("accepts questions, with an optional explanation, rebuilt from their fields", () => {
    const parsed = parseContent(content([question(), question({ explanation: "ร้อน is hot." })]), {
      types,
    });
    expect(parsed.exercises[0]?.payload).toEqual({
      questions: [question(), question({ explanation: "ร้อน is hot." })],
    });
  });

  it("reports duplicate choices, as a learner reads them", () => {
    expect(issuesOf([question({ choices: ["café", " café "] })])).toEqual([
      ["0.choices.1", "duplicate-choice"],
    ]);
  });

  it("reports a correct choice that doesn't exist, and too few choices", () => {
    expect(issuesOf([question({ correct: 3 })])).toEqual([["0.correct", "out-of-range"]]);
    expect(issuesOf([question({ choices: ["hot"] })])).toEqual([["0.choices", "too-few"]]);
    expect(issuesOf([question({ choices: ["hot"], correct: 1 })])).toEqual([
      ["0.choices", "too-few"],
      ["0.correct", "out-of-range"],
    ]);
  });

  it("reports wrong types, missing and unknown fields, and getters", () => {
    const withGetter = Object.defineProperty(question(), "prompt", {
      enumerable: true,
      get: () => "x",
    });
    expect(
      issuesOf([
        question({ prompt: 1, correct: -1, extra: true }),
        { choices: ["a", "b"], correct: 0 },
        withGetter,
      ]),
    ).toEqual([
      ["0.extra", "unknown-field"],
      ["0.prompt", "expected-text"],
      ["0.correct", "expected-whole-number"],
      ["1.prompt", "required"],
      ["2.prompt", "not-data"],
      ["2.prompt", "required"],
    ]);
    expect(issuesOf([])).toEqual([["", "too-few"]]);
  });

  it("stops at once over the choice and item limits", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `choice ${i}`);
    expect(
      failure(() => parseContent(content([question({ choices: nine })]), { types })).code,
    ).toBe("TOO_MANY_CHOICES");
    expect(
      failure(() => parseContent(content(Array.from({ length: 101 }, () => question())), { types }))
        .code,
    ).toBe("TOO_MANY_ITEMS");
  });
});

describe("multiple choice: answers", () => {
  const [exercise] = parseContent(content([question(), question({ correct: 2 })]), {
    types,
  }).exercises;
  if (!exercise) {
    throw new Error("the fixture has one exercise");
  }

  it("grades each question by position; an unanswered one is wrong", () => {
    expect(gradeAnswer(exercise, { selected: [0, 2] }, { types })).toEqual({
      score: 2,
      max: 2,
      items: [true, true],
    });
    expect(gradeAnswer(exercise, { selected: [1, null] }, { types })).toEqual({
      score: 0,
      max: 2,
      items: [false, false],
    });
  });

  it("refuses answers that don't fit the questions", () => {
    for (const answer of [
      { selected: [0] },
      { selected: [0, 3] },
      { selected: [0, 1.5] },
      { selected: [0, "1"] },
      { selected: [0, 1], extra: 1 },
      [0, 1],
    ]) {
      expect(
        failure(() => gradeAnswer(exercise, answer, { types })).code,
        JSON.stringify(answer),
      ).toBe("INVALID_ANSWER");
    }
  });
});
