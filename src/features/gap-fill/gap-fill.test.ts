import { describe, expect, it } from "vitest";
import { isLearnError } from "../../core/errors/learn-error.js";
import { createExerciseTypes } from "../../core/model/exercise-type.js";
import type { LanguageProfile } from "../../core/model/language-profile.js";
import { gradeAnswer } from "../../core/operations/grade-answer.js";
import { parseContent } from "../../core/operations/parse-content.js";
import { gapFill, splitAtGap } from "./gap-fill.js";

const types = createExerciseTypes([gapFill]);
const thai: LanguageProfile = {
  code: "th",
  direction: "ltr",
  normalizeAnswer: (t) => t.replace(/\s+/g, ""),
};
const item = (overrides: Record<string, unknown> = {}) => ({
  sentence: "ฉัน ___ ข้าว",
  answers: ["กิน", "ทาน"],
  ...overrides,
});
const content = (items: unknown[]) => ({
  version: 1,
  exercises: [{ id: "g", type: "gap-fill", payload: { items } }],
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

describe("splitAtGap", () => {
  it("splits at one run of three or more underscores", () => {
    expect(splitAtGap("ฉัน ___ ข้าว")).toEqual(["ฉัน ", " ข้าว"]);
    expect(splitAtGap("_____ first")).toEqual(["", " first"]);
    expect(splitAtGap("no gap")).toBeUndefined();
    expect(splitAtGap("two ___ gaps ___")).toBeUndefined();
    expect(splitAtGap("too__short")).toBeUndefined();
  });

  it("keeps no state between calls", () => {
    for (let i = 0; i < 3; i++) {
      expect(splitAtGap("a ___ b")).toEqual(["a ", " b"]);
    }
  });
});

describe("gap fill: content", () => {
  it("accepts typed and picked items, with optional translations", () => {
    const items = [item({ translation: "I eat rice." }), item({ options: ["กิน", "นอน", "ไป"] })];
    expect(parseContent(content(items), { types }).exercises[0]?.payload).toEqual({ items });
  });

  it("reports sentences without exactly one gap", () => {
    expect(issuesOf([item({ sentence: "no gap" }), item({ sentence: "___ and ___" })])).toEqual([
      ["0.sentence", "gap-count"],
      ["1.sentence", "gap-count"],
    ]);
  });

  it("reports choices that repeat, or that miss every accepted answer", () => {
    expect(issuesOf([item({ options: ["นอน", " นอน "] })])).toEqual([
      ["0.options.1", "duplicate-choice"],
      ["0.options", "answer-not-in-options"],
    ]);
  });

  it("reports missing answers, too few choices, wrong types and unknown fields", () => {
    expect(
      issuesOf([
        item({ answers: [] }),
        item({ options: ["กิน"] }),
        item({ answers: "กิน", hint: 1 }),
      ]),
    ).toEqual([
      ["0.answers", "too-few"],
      ["1.options", "too-few"],
      ["2.hint", "unknown-field"],
      ["2.answers", "expected-list"],
    ]);
  });
});

describe("gap fill: answers", () => {
  const [exercise] = parseContent(
    content([item(), item({ sentence: "___ coffee", answers: ["café"] })]),
    {
      types,
    },
  ).exercises;
  if (!exercise) {
    throw new Error("the fixture has one exercise");
  }

  it("accepts any listed answer after NFC and the profile's rules", () => {
    expect(gradeAnswer(exercise, { filled: [" ทาน ", "café"] }, { types, profile: thai })).toEqual({
      score: 2,
      max: 2,
      items: [true, true],
    });
    // Without the Thai profile, spaces inside the answer matter.
    expect(gradeAnswer(exercise, { filled: ["ก ิน", "café"] }, { types })).toEqual({
      score: 1,
      max: 2,
      items: [false, true],
    });
  });

  it("marks empty and unanswered gaps wrong", () => {
    expect(gradeAnswer(exercise, { filled: ["", null] }, { types, profile: thai })).toEqual({
      score: 0,
      max: 2,
      items: [false, false],
    });
  });

  it("refuses answers that don't fit the items", () => {
    for (const answer of [
      { filled: ["กิน"] },
      { filled: ["กิน", 1] },
      { filled: "กิน" },
      ["กิน", "café"],
    ]) {
      expect(
        failure(() => gradeAnswer(exercise, answer, { types })).code,
        JSON.stringify(answer),
      ).toBe("INVALID_ANSWER");
    }
    expect(
      failure(() => gradeAnswer(exercise, { filled: ["x".repeat(2_001), null] }, { types })).code,
    ).toBe("TEXT_TOO_LONG");
  });
});
