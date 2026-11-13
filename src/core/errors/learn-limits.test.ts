import { coreLimits } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { isLearnError } from "./learn-error.js";
import { learnLimitDefinitions, learnLimits } from "./learn-limits.js";

function violation(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the limit to be exceeded");
}

describe("learnLimits", () => {
  it("has ADR 0002's defaults", () => {
    const { limits } = learnLimits.resolve();
    expect(limits.maxContentSize).toEqual({ maximum: 2_000_000, warning: 512_000 });
    expect(limits.maxExercises).toEqual({ maximum: 500, warning: Number.POSITIVE_INFINITY });
    expect(limits.maxItems.maximum).toBe(100);
    expect(limits.maxChoices.maximum).toBe(8);
    expect(limits.maxTiles.maximum).toBe(30);
    expect(limits.maxTextLength.maximum).toBe(2_000);
    expect(limits.maxFileSize).toEqual({ maximum: 5_000_000, warning: 1_000_000 });
  });

  it("keeps sdk-core's other core limits unchanged", () => {
    for (const name of ["maxFiles", "maxDecodedSize", "maxProcessingTime"] as const) {
      expect(learnLimitDefinitions[name]).toEqual(coreLimits[name]);
    }
  });

  it("throws a LearnError with the limit's code and details", () => {
    const policy = learnLimits.resolve();
    const error = violation(() => policy.check("maxExercises", 501));
    expect(isLearnError(error, "TOO_MANY_EXERCISES")).toBe(true);
    expect((error as { details: unknown }).details).toEqual({
      limit: "maxExercises",
      maximum: 500,
      actual: 501,
      unit: "count",
    });
    for (const [limit, code] of [
      ["maxContentSize", "CONTENT_TOO_LARGE"],
      ["maxItems", "TOO_MANY_ITEMS"],
      ["maxChoices", "TOO_MANY_CHOICES"],
      ["maxTiles", "TOO_MANY_TILES"],
      ["maxTextLength", "TEXT_TOO_LONG"],
      ["maxFileSize", "FILE_TOO_LARGE"],
    ] as const) {
      expect(
        isLearnError(
          violation(() => policy.check(limit, 1e12)),
          code,
        ),
        limit,
      ).toBe(true);
    }
  });

  it("warns from the warning threshold, within the maximum", () => {
    const policy = learnLimits.resolve();
    expect(policy.check("maxContentSize", 511_999)).toBeUndefined();
    expect(policy.check("maxContentSize", 512_000)).toBe("warning");
    expect(policy.check("maxContentSize", 2_000_000)).toBe("warning");
  });

  it("applies a host's settings, and rejects a misspelt limit", () => {
    const policy = learnLimits.resolve({
      maxTextLength: 10_000,
      maxItems: { maximum: 300, warning: 200 },
    });
    expect(policy.check("maxTextLength", 9_000)).toBeUndefined();
    expect(policy.check("maxItems", 250)).toBe("warning");
    expect(() => learnLimits.resolve({ maxTextLenght: 10 } as never)).toThrow(TypeError);
  });
});
