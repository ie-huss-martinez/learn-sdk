import { describe, expect, it } from "vitest";
import { shortAnswer } from "../../test/test-types.js";
import { isLearnError } from "../errors/learn-error.js";
import { createExerciseTypes, defineExerciseType } from "../model/exercise-type.js";
import { gradeAnswer } from "./grade-answer.js";
import { parseContent } from "./parse-content.js";

const types = createExerciseTypes([shortAnswer]);
const content = parseContent(
  {
    format: "hm-learn-content",
    version: 1,
    exercises: [
      {
        id: "a",
        type: "short-answer",
        payload: {
          questions: [
            { prompt: "eat", accepted: ["กินข้าว"] },
            { prompt: "coffee", accepted: ["café"] },
          ],
        },
      },
    ],
  },
  { types },
);
const [exercise] = content.exercises;
if (!exercise) {
  throw new Error("the fixture has one exercise");
}
const thai = {
  code: "th",
  direction: "ltr",
  normalizeAnswer: (t: string) => t.replace(/\s+/g, ""),
} as const;

describe("gradeAnswer", () => {
  it("grades through the type, with NFC and the profile's rules", () => {
    expect(gradeAnswer(exercise, ["กิน ข้าว", "café"], { types, profile: thai })).toEqual({
      score: 2,
      max: 2,
      items: [true, true],
    });
    expect(gradeAnswer(exercise, ["กิน ข้าว", "cafe"], { types })).toEqual({
      score: 0,
      max: 2,
      items: [false, false],
    });
  });

  it("validates the answer first, like content", () => {
    for (const answer of [undefined, "x", ["only one"], [1, 2]]) {
      let error: unknown;
      try {
        gradeAnswer(exercise, answer, { types });
      } catch (thrown) {
        error = thrown;
      }
      expect(isLearnError(error, "INVALID_ANSWER"), JSON.stringify(answer)).toBe(true);
      expect((error as { details?: { reason?: string } }).details?.reason).toBe("malformed-answer");
    }
  });

  it("refuses an exercise whose type isn't available", () => {
    expect(() => gradeAnswer({ ...exercise, type: "essay" }, [], { types })).toThrow(
      expect.objectContaining({
        code: "INVALID_DOCUMENT",
        details: {
          reason: "malformed-document",
          count: 1,
          issues: [{ path: ["type"], code: "unknown-type" }],
        },
      }),
    );
  });

  it("rejects an invalid grade from a host's type", () => {
    const cheating = defineExerciseType<unknown, unknown>({
      type: "cheating",
      validate: (payload) => payload,
      validateAnswer: (answer) => answer,
      grade: () => ({ score: 5, max: 1, items: [] }),
    });
    expect(() =>
      gradeAnswer({ id: "x", type: "cheating", payload: {} }, 1, {
        types: createExerciseTypes([cheating]),
      }),
    ).toThrow(TypeError);
  });
});
