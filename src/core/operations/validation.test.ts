import { describe, expect, it } from "vitest";
import { isLearnError } from "../errors/learn-error.js";
import { learnLimits } from "../errors/learn-limits.js";
import { createIssueSink, createValidationContext, MAX_ISSUES } from "./validation.js";

const setup = () => {
  const sink = createIssueSink();
  return { sink, context: createValidationContext(learnLimits.resolve(), sink) };
};

describe("ValidationContext.fields", () => {
  it("never calls a getter, and reports it as not-data", () => {
    const { sink, context } = setup();
    let called = false;
    const value = {
      get prompt() {
        called = true;
        return "hi";
      },
    };
    const fields = context.fields(value, ["prompt"]);
    expect(called).toBe(false);
    expect(fields?.prompt).toBeUndefined();
    expect(sink.issues).toEqual([{ path: ["prompt"], code: "not-data" }]);
  });

  it("reports __proto__, constructor and symbol keys as unknown fields, and pollutes nothing", () => {
    const { sink, context } = setup();
    const parsed = JSON.parse('{"prompt": "x", "__proto__": {"polluted": true}, "constructor": 1}');
    const withSymbol = Object.assign(parsed, { [Symbol("s")]: 1 });
    const fields = context.fields(withSymbol, ["prompt"]);
    expect(fields?.prompt).toBe("x");
    expect(sink.issues.map((i) => [i.path[0], i.code])).toEqual([
      ["__proto__", "unknown-field"],
      ["constructor", "unknown-field"],
      ["Symbol(s)", "unknown-field"],
    ]);
    expect(Object.getPrototypeOf(fields)).toBe(null);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("cuts a long unknown key in the path", () => {
    const { sink, context } = setup();
    context.fields({ ["k".repeat(1_000)]: 1 }, []);
    expect(String(sink.issues[0]?.path[0])).toHaveLength(64);
  });

  it("reads a well-behaved Proxy as data, and turns a throwing or revoked one into not-data", () => {
    const ok = setup();
    expect(ok.context.fields(new Proxy({ prompt: "x" }, {}), ["prompt"])).toEqual({ prompt: "x" });
    expect(ok.sink.count).toBe(0);

    const throwing = setup();
    const trap = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("trap");
        },
      },
    );
    expect(throwing.context.fields(trap, ["prompt"])).toBeUndefined();
    expect(throwing.sink.issues).toEqual([{ path: [], code: "not-data" }]);

    const revoked = setup();
    const { proxy, revoke } = Proxy.revocable({ prompt: "x" }, {});
    revoke();
    expect(revoked.context.fields(proxy, ["prompt"])).toBeUndefined();
    expect(revoked.sink.issues).toEqual([{ path: [], code: "not-data" }]);
  });

  it("stops listing unknown keys once the issue cap is reached", () => {
    const { sink, context } = setup();
    const many = Object.fromEntries(Array.from({ length: 5_000 }, (_, i) => [`k${i}`, i]));
    context.fields(many, []);
    expect(sink.issues).toHaveLength(MAX_ISSUES);
    expect(sink.count).toBe(MAX_ISSUES);
  });

  it("reports the wrong kind of value", () => {
    const { sink, context } = setup();
    for (const value of [null, [], "x", 3]) {
      expect(context.fields(value, [])).toBeUndefined();
    }
    expect(sink.issues.every((i) => i.code === "expected-object")).toBe(true);
  });
});

describe("ValidationContext.list", () => {
  it("checks the limit before reading entries, so huge or sparse lists stop at once", () => {
    const { context } = setup();
    const sparse = [] as unknown[];
    sparse.length = 4_000_000_000;
    let error: unknown;
    try {
      context.list(sparse, { limit: "maxItems" });
    } catch (thrown) {
      error = thrown;
    }
    expect(isLearnError(error, "TOO_MANY_ITEMS")).toBe(true);
  });

  it("never calls an index getter", () => {
    const { sink, context } = setup();
    let called = false;
    const list = ["a", "b"];
    Object.defineProperty(list, 1, {
      get() {
        called = true;
        return "z";
      },
    });
    expect(context.list(list, { limit: "maxItems" })).toEqual(["a", undefined]);
    expect(called).toBe(false);
    expect(sink.issues).toEqual([{ path: [1], code: "not-data" }]);
  });

  it("returns a fresh array, and reports too few entries", () => {
    const { sink, context } = setup();
    const input = ["a"];
    const copy = context.list(input, { limit: "maxChoices", minimum: 2 });
    expect(copy).toEqual(["a"]);
    expect(copy).not.toBe(input);
    expect(sink.issues).toEqual([{ path: [], code: "too-few", details: { minimum: 2 } }]);
  });
});

describe("ValidationContext scalars", () => {
  it("checks text, whole numbers and yes/no, with required and optional values", () => {
    const { sink, context } = setup();
    expect(context.at("a").text("hi")).toBe("hi");
    expect(context.at("b").text("  ")).toBeUndefined();
    expect(context.at("c").text(undefined)).toBeUndefined();
    expect(context.at("d").text(undefined, { optional: true })).toBeUndefined();
    expect(context.at("e").wholeNumber(2.5)).toBeUndefined();
    expect(context.at("f").yesNo("true")).toBeUndefined();
    expect(sink.issues.map((i) => [i.path[0], i.code])).toEqual([
      ["b", "empty-text"],
      ["c", "required"],
      ["e", "expected-whole-number"],
      ["f", "expected-yes-no"],
    ]);
  });

  it("throws TEXT_TOO_LONG over the limit", () => {
    const { context } = setup();
    expect(() => context.text("x".repeat(2_001))).toThrow(
      expect.objectContaining({ code: "TEXT_TOO_LONG" }),
    );
  });
});
