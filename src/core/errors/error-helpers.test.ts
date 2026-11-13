import { SdkError } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { abortError, asLearnError, throwIfAborted } from "./error-helpers.js";
import { isLearnError, LearnError } from "./learn-error.js";

describe("asLearnError", () => {
  it("returns a LearnError as it is", () => {
    const error = new LearnError("INVALID_ANSWER", "No such choice.");
    expect(asLearnError(error)).toBe(error);
  });

  it("keeps another SdkError's code and details, with the original as cause", () => {
    const original = new SdkError("FILE_TOO_LARGE", "Clip too large.", {
      details: { limit: "maxFileSize", maximum: 5_000_000, actual: 9_000_000, unit: "bytes" },
    });
    const adapted = asLearnError(original);
    expect(isLearnError(adapted, "FILE_TOO_LARGE")).toBe(true);
    expect(adapted.details).toEqual(original.details);
    expect(adapted.cause).toBe(original);
  });

  it("makes anything else UNKNOWN, keeping it as cause", () => {
    const thrown = new TypeError("audio source exploded");
    const adapted = asLearnError(thrown);
    expect(isLearnError(adapted, "UNKNOWN")).toBe(true);
    expect(adapted.cause).toBe(thrown);
  });
});

describe("abortError and throwIfAborted", () => {
  it("reports ABORTED for a cancel and TIMEOUT for a timeout", () => {
    const cancelled = new AbortController();
    cancelled.abort();
    expect(abortError(cancelled.signal).code).toBe("ABORTED");
    const timedOut = new AbortController();
    timedOut.abort(new DOMException("Timed out", "TimeoutError"));
    expect(abortError(timedOut.signal).code).toBe("TIMEOUT");
  });

  it("throws only once the signal has aborted", () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
    expect(() => throwIfAborted(undefined)).not.toThrow();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(LearnError);
  });
});
