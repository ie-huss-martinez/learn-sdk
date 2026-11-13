import { describe, expect, it } from "vitest";
import { shortAnswer } from "../../test/test-types.js";
import { createExerciseTypes, defineExerciseType } from "./exercise-type.js";

const fns = {
  validate: () => undefined,
  validateAnswer: () => undefined,
  grade: () => ({ score: 0, max: 0, items: [] }),
};

describe("defineExerciseType", () => {
  it("accepts lowercase names joined by hyphens, and freezes the definition", () => {
    const type = defineExerciseType({ type: "word-order", ...fns });
    expect(Object.isFrozen(type)).toBe(true);
  });

  it("rejects other names and missing functions", () => {
    for (const name of ["Word", "word_order", "-word", "word--order", "x".repeat(41), ""]) {
      expect(() => defineExerciseType({ type: name, ...fns }), name).toThrow(TypeError);
    }
    expect(() => defineExerciseType({ type: "x", ...fns, grade: undefined } as never)).toThrow(
      TypeError,
    );
  });
});

describe("createExerciseTypes", () => {
  it("collects types by name, and refuses duplicates", () => {
    expect(createExerciseTypes([shortAnswer]).get("short-answer")).toBe(shortAnswer);
    expect(() => createExerciseTypes([shortAnswer, shortAnswer])).toThrow(TypeError);
  });
});
