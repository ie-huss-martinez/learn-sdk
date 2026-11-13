import { deserializeError, isSdkError, SdkError, serializeError } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { isLearnError, LearnError } from "./learn-error.js";

describe("LearnError", () => {
  it("carries a code, details and cause, as an SdkError", () => {
    const cause = new SyntaxError("Unexpected token");
    const error = new LearnError("INVALID_CONTENT", "Content isn't JSON.", {
      details: { count: 1, issues: [{ path: [], code: "not-json" }] },
      cause,
    });
    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({
      name: "LearnError",
      code: "INVALID_CONTENT",
      details: { count: 1, issues: [{ path: [], code: "not-json" }] },
      cause,
    });
    expect(isSdkError(error, "INVALID_CONTENT")).toBe(true);
  });

  it("keeps its class, code and details when serialised, as a server's grading error is", () => {
    const original = new LearnError("TOO_MANY_ITEMS", "Too many questions.", {
      details: { limit: "maxItems", maximum: 100, actual: 5_000, unit: "count" },
    });
    // What a server sends the browser, as JSON.
    const received = JSON.parse(JSON.stringify(serializeError(original)));
    const rebuilt = deserializeError(received, { errorClasses: { LearnError } });
    expect(rebuilt).toBeInstanceOf(LearnError);
    expect(isLearnError(rebuilt, "TOO_MANY_ITEMS")).toBe(true);
    expect(rebuilt.details).toEqual(original.details);
  });
});

describe("isLearnError", () => {
  it("recognises a LearnError, and checks its code when given one", () => {
    const error = new LearnError("AUDIO_UNAVAILABLE", "The audio source returned nothing.");
    expect(isLearnError(error)).toBe(true);
    expect(isLearnError(error, "AUDIO_UNAVAILABLE")).toBe(true);
    expect(isLearnError(error, "INVALID_CONTENT")).toBe(false);
  });

  it("rejects other SDK errors and plain values", () => {
    expect(isLearnError(new SdkError("ABORTED", "Stopped."))).toBe(false);
    expect(isLearnError(new Error("INVALID_CONTENT"))).toBe(false);
    expect(isLearnError({ name: "LearnError", code: "INVALID_CONTENT", message: "forged" })).toBe(
      false,
    );
    expect(isLearnError(undefined)).toBe(false);
  });
});
