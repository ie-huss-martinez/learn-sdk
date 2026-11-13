import { afterEach, describe, expect, it, vi } from "vitest";
import { shortAnswer } from "../../test/test-types.js";
import { isLearnError } from "../errors/learn-error.js";
import { createExerciseTypes } from "../model/exercise-type.js";
import { parseContent } from "./parse-content.js";

const types = createExerciseTypes([shortAnswer]);
const exercise = (id: string) => ({
  id,
  type: "short-answer",
  title: "Food",
  payload: { questions: [{ prompt: "eat", accepted: ["กิน", "ทาน"] }] },
});
const valid = () => ({ version: 1, exercises: [exercise("a"), exercise("b")] });

function failure(run: () => unknown): {
  code: string;
  details: { count: number; issues: { path: unknown[]; code: string }[] };
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
    const text = JSON.stringify({ version: 1, exercises: [], note: "ก".repeat(700_000) });
    expect(failure(() => parseContent(text, { types })).code).toBe("CONTENT_TOO_LARGE");
    expect(parse).not.toHaveBeenCalled();
    // The same text under a raised limit is parsed, and then fails on its unknown field.
    const raised = failure(() => parseContent(text, { types, limits: { maxContentSize: 3e6 } }));
    expect(raised.code).toBe("INVALID_CONTENT");
  });

  it("reports text that isn't JSON as an issue, without the parser's message", () => {
    const error = failure(() => parseContent("{oops", { types }));
    expect(error.code).toBe("INVALID_CONTENT");
    expect(error.details.issues).toEqual([{ path: [], code: "not-json" }]);
  });

  it("refuses an unknown format version before reading anything else", () => {
    const error = failure(() => parseContent({ version: 2, exercises: "anything" }, { types }));
    expect(error.code).toBe("UNSUPPORTED_CONTENT_VERSION");
    expect(error.details).toEqual({ version: 2, supported: [1] });
    expect(failure(() => parseContent({ exercises: [] }, { types })).details.issues).toEqual([
      { path: ["version"], code: "required" },
    ]);
  });

  it("reports unknown types, duplicate ids, unknown fields and missing payloads with their paths", () => {
    const content = {
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
    const content = { version: 1, exercises: [{ ...exercise("a"), title: deep }] };
    expect(failure(() => parseContent(content, { types })).details.issues).toEqual([
      { path: ["exercises", 0, "title"], code: "expected-text" },
    ]);
  });

  it("terminates on a cycle", () => {
    const content: { version: number; exercises: unknown[] } = { version: 1, exercises: [] };
    content.exercises.push(content);
    const issues = failure(() => parseContent(content, { types })).details.issues;
    expect(issues.map((i) => i.code)).toEqual([
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
      version: 1,
      exercises: Array.from({ length: 150 }, (_, i) => ({ ...exercise(`e${i}`), extra: i })),
    };
    const error = failure(() => parseContent(content, { types }));
    expect(error.details.count).toBe(150);
    expect(error.details.issues).toHaveLength(100);
  });

  it("stops at once on a count limit", () => {
    const content = {
      version: 1,
      exercises: Array.from({ length: 501 }, (_, i) => exercise(`e${i}`)),
    };
    expect(failure(() => parseContent(content, { types })).code).toBe("TOO_MANY_EXERCISES");
  });
});
