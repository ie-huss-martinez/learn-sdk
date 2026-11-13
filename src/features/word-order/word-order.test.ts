import { describe, expect, it } from "vitest";
import { isLearnError } from "../../core/errors/learn-error.js";
import { createExerciseTypes } from "../../core/model/exercise-type.js";
import { gradeAnswer } from "../../core/operations/grade-answer.js";
import { parseContent } from "../../core/operations/parse-content.js";
import { wordOrder } from "./word-order.js";

const types = createExerciseTypes([wordOrder]);
const content = (items: unknown[]) => ({
  version: 1,
  exercises: [{ id: "w", type: "word-order", payload: { items } }],
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
const issuesOf = (items: unknown[]) =>
  failure(() => parseContent(content(items), { types })).details.issues.map((issue) => [
    issue.path.slice(4).join("."),
    issue.code,
  ]);

describe("word order: content", () => {
  it("accepts tiles, other right orders and a translation, as stored", () => {
    const items = [
      { tiles: ["ฉัน", "กิน", "ข้าว"], translation: "I eat rice." },
      { tiles: ["วันนี้", "ฉัน", "ไป", "ตลาด"], alternatives: [["ฉัน", "ไป", "ตลาด", "วันนี้"]] },
    ];
    expect(parseContent(content(items), { types }).exercises[0]?.payload).toEqual({ items });
  });

  it("drops an empty list of alternatives", () => {
    const [exercise] = parseContent(content([{ tiles: ["a", "b"], alternatives: [] }]), {
      types,
    }).exercises;
    expect(exercise?.payload).toEqual({ items: [{ tiles: ["a", "b"] }] });
  });

  it("reports alternatives that don't use every tile exactly once", () => {
    expect(
      issuesOf([
        {
          tiles: ["a", "b", "b"],
          alternatives: [
            ["b", "a", "b"],
            ["a", "b"],
            ["a", "b", "c"],
            ["a", "a", "b"],
          ],
        },
      ]),
    ).toEqual([
      ["0.alternatives.1", "not-a-permutation"],
      ["0.alternatives.2", "not-a-permutation"],
      ["0.alternatives.3", "not-a-permutation"],
    ]);
  });

  it("reports too few tiles, wrong types and unknown fields, and stops over maxTiles", () => {
    expect(issuesOf([{ tiles: ["a"] }, { tiles: "a b", alternatives: "b a", hint: 1 }])).toEqual([
      ["0.tiles", "too-few"],
      ["1.hint", "unknown-field"],
      ["1.tiles", "expected-list"],
      ["1.alternatives", "expected-list"],
    ]);
    const tooMany = Array.from({ length: 31 }, (_, i) => `w${i}`);
    expect(failure(() => parseContent(content([{ tiles: tooMany }]), { types })).code).toBe(
      "TOO_MANY_TILES",
    );
  });
});

describe("word order: answers", () => {
  const [exercise] = parseContent(
    content([
      { tiles: ["ฉัน", "กิน", "ข้าว"] },
      { tiles: ["very", "very", "good"] },
      { tiles: ["วันนี้", "ฉัน", "ไป"], alternatives: [["ฉัน", "ไป", "วันนี้"]] },
    ]),
    { types },
  ).exercises;
  if (!exercise) {
    throw new Error("the fixture has one exercise");
  }

  it("grades by the texts the positions put in order, so identical tiles can swap", () => {
    expect(
      gradeAnswer(
        exercise,
        {
          orders: [
            [0, 1, 2],
            [1, 0, 2],
            [1, 2, 0],
          ],
        },
        { types },
      ),
    ).toEqual({
      score: 3,
      max: 3,
      items: [true, true, true],
    });
    expect(gradeAnswer(exercise, { orders: [[1, 0, 2], [0, 2, 1], null] }, { types })).toEqual({
      score: 0,
      max: 3,
      items: [false, false, false],
    });
  });

  it("refuses answers that don't use every tile exactly once", () => {
    for (const orders of [
      [[0, 1], null, null],
      [[0, 0, 1], null, null],
      [[0, 1, 3], null, null],
      [[0, 1, 2.5], null, null],
      [[0, 1, 2], null],
      [["0", "1", "2"], null, null],
    ]) {
      expect(
        failure(() => gradeAnswer(exercise, { orders }, { types })).code,
        JSON.stringify(orders),
      ).toBe("INVALID_ANSWER");
    }
    const issues = failure(() =>
      gradeAnswer(exercise, { orders: [[0, 0, 1], null, null] }, { types }),
    ).details.issues;
    expect(issues).toEqual([{ path: ["orders", 0], code: "not-a-permutation" }]);
  });
});
