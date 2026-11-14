import { afterEach, describe, expect, it, vi } from "vitest";
import { shortAnswer } from "../../test/test-types.js";
import { isLearnError } from "../errors/learn-error.js";
import { createExerciseTypes, defineExerciseType } from "../model/exercise-type.js";
import { parseContent } from "./parse-content.js";

const types = createExerciseTypes([shortAnswer]);
const exercise = (id: string) => ({
  id,
  type: "short-answer",
  title: "Food",
  payload: { questions: [{ prompt: "eat", accepted: ["กิน", "ทาน"] }] },
});
const valid = () => ({
  format: "hm-learn-content",
  version: 1,
  exercises: [exercise("a"), exercise("b")],
});

function failure(run: () => unknown): {
  code: string;
  details: { reason?: string; count: number; issues: { path: unknown[]; code: string }[] } & Record<
    string,
    unknown
  >;
} {
  try {
    run();
  } catch (error) {
    if (isLearnError(error)) {
      return error as never;
    }
    throw error;
  }
  throw new Error("expected a LearnError");
}

describe("parseContent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts valid content as a string or an object, and shares no objects with the input", () => {
    expect(parseContent(JSON.stringify(valid()), { types })).toEqual(valid());
    const input = valid();
    const parsed = parseContent(input, { types });
    expect(parsed).toEqual(input);
    expect(parsed.exercises[0]).not.toBe(input.exercises[0]);
    expect(parsed.exercises[0]?.payload).not.toBe(input.exercises[0]?.payload);
  });

  it("checks the UTF-8 size before parsing", () => {
    const parse = vi.spyOn(JSON, "parse");
    // 700,000 Thai characters are 2.1 MB in UTF-8, though only 700,000 code units.
    const text = JSON.stringify({
      format: "hm-learn-content",
      version: 1,
      exercises: [],
      note: "ก".repeat(700_000),
    });
    expect(failure(() => parseContent(text, { types })).code).toBe("CONTENT_TOO_LARGE");
    expect(parse).not.toHaveBeenCalled();
    // The same text under a raised limit is parsed, and then fails on its unknown field.
    const raised = failure(() => parseContent(text, { types, limits: { maxContentSize: 3e6 } }));
    expect(raised.code).toBe("INVALID_DOCUMENT");
  });

  it("refuses text that isn't JSON with the reason not-json, without the parser's message", () => {
    const error = failure(() => parseContent("{oops", { types }));
    expect(error.code).toBe("INVALID_DOCUMENT");
    expect(error.details).toEqual({ reason: "not-json" });
  });

  it("returns content carrying its format and version, ready to store", () => {
    expect(parseContent(valid(), { types })).toMatchObject({
      format: "hm-learn-content",
      version: 1,
    });
  });

  it("refuses another format, or a missing one, with UNSUPPORTED_FORMAT and the reason unknown-format", () => {
    for (const [input, found] of [
      [{ version: 1, exercises: [] }, { version: 1 }],
      [
        { format: "hm-audio-plan", version: 1, exercises: [] },
        { format: "hm-audio-plan", version: 1 },
      ],
    ] as const) {
      const error = failure(() => parseContent(input, { types }));
      expect(error.code).toBe("UNSUPPORTED_FORMAT");
      expect(error.details).toEqual({ reason: "unknown-format", ...found, supported: [1] });
    }
  });

  it("refuses an unknown format version before reading anything else", () => {
    const error = failure(() =>
      parseContent({ format: "hm-learn-content", version: 2, exercises: "anything" }, { types }),
    );
    expect(error.code).toBe("UNSUPPORTED_FORMAT");
    expect(error.details).toEqual({
      reason: "unknown-format-version",
      format: "hm-learn-content",
      version: 2,
      supported: [1],
    });
    const missing = failure(() =>
      parseContent({ format: "hm-learn-content", exercises: [] }, { types }),
    );
    expect(missing.code).toBe("INVALID_DOCUMENT");
    expect(missing.details.reason).toBe("malformed-document");
    expect(missing.details.issues).toEqual([{ path: ["version"], code: "required" }]);
  });

  it("reports unknown types, duplicate ids, unknown fields and missing payloads with their paths", () => {
    const content = {
      format: "hm-learn-content",
      version: 1,
      exercises: [
        exercise("a"),
        { ...exercise("a"), extra: true },
        { id: "c", type: "essay", payload: {} },
        { id: "d", type: "short-answer" },
      ],
    };
    const error = failure(() => parseContent(content, { types }));
    expect(error.details.issues).toEqual([
      { path: ["exercises", 1, "extra"], code: "unknown-field" },
      { path: ["exercises", 1, "id"], code: "duplicate-id" },
      { path: ["exercises", 2, "type"], code: "unknown-type" },
      { path: ["exercises", 3, "payload"], code: "required" },
    ]);
  });

  it("never follows untrusted nesting: 100,000 levels in a field are just the wrong type", () => {
    const deep = JSON.parse(`${"[".repeat(100_000)}${"]".repeat(100_000)}`);
    const content = {
      format: "hm-learn-content",
      version: 1,
      exercises: [{ ...exercise("a"), title: deep }],
    };
    expect(failure(() => parseContent(content, { types })).details.issues).toEqual([
      { path: ["exercises", 0, "title"], code: "expected-text" },
    ]);
  });

  it("terminates on a cycle", () => {
    const content: { format: string; version: number; exercises: unknown[] } = {
      format: "hm-learn-content",
      version: 1,
      exercises: [],
    };
    content.exercises.push(content);
    const issues = failure(() => parseContent(content, { types })).details.issues;
    expect(issues.map((i) => i.code)).toEqual([
      "unknown-field",
      "unknown-field",
      "unknown-field",
      "required",
      "required",
      "required",
    ]);
  });

  it("never calls a getter in already-parsed content", () => {
    let called = false;
    const content = valid();
    Object.defineProperty(content.exercises[0], "title", {
      enumerable: true,
      get() {
        called = true;
        return "Food";
      },
    });
    const issues = failure(() => parseContent(content, { types })).details.issues;
    expect(called).toBe(false);
    expect(issues).toEqual([{ path: ["exercises", 0, "title"], code: "not-data" }]);
  });

  it("keeps 100 issues and counts them all", () => {
    const content = {
      format: "hm-learn-content",
      version: 1,
      exercises: Array.from({ length: 150 }, (_, i) => ({ ...exercise(`e${i}`), extra: i })),
    };
    const error = failure(() => parseContent(content, { types }));
    expect(error.details.count).toBe(150);
    expect(error.details.issues).toHaveLength(100);
  });

  it("stops at once on a count limit", () => {
    const content = {
      format: "hm-learn-content",
      version: 1,
      exercises: Array.from({ length: 501 }, (_, i) => exercise(`e${i}`)),
    };
    expect(failure(() => parseContent(content, { types })).code).toBe("TOO_MANY_EXERCISES");
  });

  it("counts text lengths in Unicode code points (ADR 0006)", () => {
    const withTitle = (title: string) => ({ ...valid(), exercises: [{ ...exercise("a"), title }] });
    // 2,000 emoji are 2,000 code points, though 4,000 UTF-16 units.
    expect(() => parseContent(withTitle("😀".repeat(2_000)), { types })).not.toThrow();
    expect(failure(() => parseContent(withTitle("😀".repeat(2_001)), { types })).code).toBe(
      "TEXT_TOO_LONG",
    );
    expect(failure(() => parseContent(withTitle("x".repeat(2_001)), { types })).code).toBe(
      "TEXT_TOO_LONG",
    );
  });

  it("keeps a host payload's __proto__, constructor and toString keys as plain data", () => {
    const freeForm = defineExerciseType<Record<string, unknown>, unknown>({
      type: "free-form",
      validate: (payload, context) => {
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
          context.issue("expected-object");
          return undefined;
        }
        return payload as Record<string, unknown>;
      },
      validateAnswer: (answer) => answer,
      grade: () => ({ score: 0, max: 0, items: [] }),
    });
    const payloadText = '{"__proto__":{"x":1},"constructor":"a","toString":5}';
    const text = `{"format":"hm-learn-content","version":1,"exercises":[{"id":"h","type":"free-form","payload":${payloadText}}]}`;
    const parsed = parseContent(text, { types: createExerciseTypes([freeForm]) });
    const payload = parsed.exercises[0]?.payload as object;
    expect(Object.keys(payload)).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(payload, "__proto__")?.value).toEqual({ x: 1 });
    expect(({} as { x?: number }).x).toBeUndefined();
    expect(JSON.stringify(parsed)).toBe(text);
  });

  it("requires every payload to be an object, even when its type would take anything", () => {
    const anything = defineExerciseType<unknown, unknown>({
      type: "anything",
      validate: (payload) => payload,
      validateAnswer: (answer) => answer,
      grade: () => ({ score: 0, max: 0, items: [] }),
    });
    const content = {
      format: "hm-learn-content",
      version: 1,
      exercises: [
        { id: "a", type: "anything", payload: [] },
        { id: "b", type: "anything", payload: "text" },
        { id: "c", type: "anything", payload: null },
      ],
    };
    const error = failure(() => parseContent(content, { types: createExerciseTypes([anything]) }));
    expect(error.details.issues).toEqual(
      [0, 1, 2].map((index) => ({
        path: ["exercises", index, "payload"],
        code: "expected-object",
      })),
    );
  });
});
