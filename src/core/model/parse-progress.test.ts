import { describe, expect, it } from "vitest";
import { isLearnError } from "../errors/learn-error.js";
import { parseProgress } from "./parse-progress.js";
import { applyProgressChanges, emptyProgress, toProgressDocument } from "./progress.js";

const AT = 1_767_225_600_000;
const snapshot = applyProgressChanges(emptyProgress, [
  {
    kind: "attempt",
    exerciseId: "e",
    answer: { selected: [1, null] },
    grade: { score: 1, max: 2, items: [true, false] },
    at: AT,
  },
  {
    kind: "review",
    itemId: "word",
    rating: "good",
    scheduling: {
      scheduler: "fsrs",
      model: "FSRS-7",
      version: 1,
      card: { stability: 3.9, dueAt: AT + 1 },
    },
    due: AT + 1,
    at: AT,
  },
]);

function failure(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (isLearnError(error)) {
      return error as unknown as {
        code: string;
        details: Record<string, unknown> & { issues?: { path: unknown[]; code: string }[] };
      };
    }
    throw error;
  }
  throw new Error("expected a LearnError");
}
const document = (overrides: Record<string, unknown> = {}) => ({
  ...toProgressDocument(snapshot),
  ...overrides,
});

describe("hm-learn-progress", () => {
  it("round-trips through JSON: write, stringify, read", () => {
    const text = JSON.stringify(toProgressDocument(snapshot));
    expect(parseProgress(text)).toEqual(snapshot);
    expect(parseProgress(JSON.parse(text))).toEqual(snapshot);
    expect(JSON.parse(text)).toMatchObject({ format: "hm-learn-progress", version: 1 });
  });

  it("carries opaque answers and scheduler states unchanged, hostile keys included, as data", () => {
    const opaque = '{"__proto__":{"x":1},"constructor":"a","toString":5}';
    const text = `{"format":"hm-learn-progress","version":1,"attempts":[{"exerciseId":"e","answer":${opaque},"grade":{"score":0,"max":1,"items":[false]},"at":${AT}}],"cards":[{"itemId":"w","scheduling":{"scheduler":"s","model":"m","version":1,"card":${opaque}},"due":${AT}}]}`;
    const read = parseProgress(text);
    for (const value of [read.attempts[0]?.answer, read.cards[0]?.scheduling.card] as object[]) {
      expect(Object.keys(value)).toEqual(["__proto__", "constructor", "toString"]);
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    }
    expect(({} as { x?: number }).x).toBeUndefined();
    expect(JSON.stringify(toProgressDocument(read))).toBe(text);
  });

  it("refuses other formats and versions with UNSUPPORTED_FORMAT, and bad text with not-json", () => {
    expect(
      failure(() => parseProgress(document({ format: "hm-learn-content" }))).details,
    ).toMatchObject({
      reason: "unknown-format",
    });
    expect(failure(() => parseProgress(document({ version: 2 }))).details).toMatchObject({
      reason: "unknown-format-version",
      version: 2,
      supported: [1],
    });
    expect(failure(() => parseProgress("{oops")).details).toEqual({ reason: "not-json" });
  });

  it("refuses a malformed document with malformed-document and each field's issue", () => {
    const attempt = toProgressDocument(snapshot).attempts[0];
    const card = toProgressDocument(snapshot).cards[0];
    const broken = document({
      attempts: [
        { ...attempt, grade: { score: 3, max: 2, items: [true] } },
        { exerciseId: "e", grade: attempt?.grade, at: AT },
        { ...attempt, at: 0 },
        { ...attempt, extra: 1 },
      ],
      cards: [{ ...card, scheduling: { scheduler: "s", model: "m", version: 1, card: () => 1 } }],
    });
    const error = failure(() => parseProgress(broken));
    expect(error.code).toBe("INVALID_DOCUMENT");
    expect(error.details["reason"]).toBe("malformed-document");
    expect(error.details.issues?.map((issue) => [issue.path.join("."), issue.code])).toEqual([
      ["attempts.0.grade.score", "out-of-range"],
      ["attempts.1.answer", "required"],
      ["attempts.2.at", "out-of-range"],
      ["attempts.3.extra", "unknown-field"],
      ["cards.0.scheduling.card", "not-data"],
    ]);
  });

  it("never calls a getter, and checks a string's size before parsing", () => {
    let called = false;
    const tricky = document();
    Object.defineProperty(tricky, "attempts", {
      enumerable: true,
      get() {
        called = true;
        return [];
      },
    });
    expect(failure(() => parseProgress(tricky)).details["reason"]).toBe("malformed-document");
    expect(called).toBe(false);
    expect(
      failure(() => parseProgress(" ".repeat(2_000), { limits: { maxContentSize: 1_000 } })).code,
    ).toBe("CONTENT_TOO_LARGE");
  });
});
