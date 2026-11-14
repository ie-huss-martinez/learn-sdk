import { createMessages } from "@hussmartinez/sdk-core";
import { describe, expect, it } from "vitest";
import { LearnError, type LearnErrorCode } from "../core/errors/learn-error.js";
import type { LearnIssueCode } from "../core/errors/learn-issues.js";
import { learnLimitDefinitions, learnLimits } from "../core/errors/learn-limits.js";
import { learnMessages } from "./en.js";

// Listing every code here makes the type checker fail when a code is added
// to LearnErrorCode or LearnIssueCode without being listed, and the test fail
// when its text is missing from the catalogue.
const ALL_ERROR_CODES: Record<LearnErrorCode, true> = {
  UNKNOWN: true,
  ABORTED: true,
  TIMEOUT: true,
  WORKER_START_FAILED: true,
  WORKER_PROTOCOL_MISMATCH: true,
  WORKER_CRASHED: true,
  WORKER_TERMINATED: true,
  WORKER_METHOD_NOT_FOUND: true,
  WORKER_DATA_NOT_CLONEABLE: true,
  UNSUPPORTED_ENVIRONMENT: true,
  FILE_TOO_LARGE: true,
  TOO_MANY_FILES: true,
  DECODED_SIZE_TOO_LARGE: true,
  PROCESSING_TIME_EXCEEDED: true,
  UNSUPPORTED_FORMAT: true,
  INVALID_DOCUMENT: true,
  INVALID_ANSWER: true,
  INVALID_COMMAND: true,
  AUDIO_UNAVAILABLE: true,
  UNSUPPORTED_SCHEDULING_STATE: true,
  STORAGE_UNAVAILABLE: true,
  CONTENT_TOO_LARGE: true,
  TOO_MANY_EXERCISES: true,
  TOO_MANY_ITEMS: true,
  TOO_MANY_CHOICES: true,
  TOO_MANY_TILES: true,
  TEXT_TOO_LONG: true,
};

const ALL_ISSUE_CODES: Record<LearnIssueCode, true> = {
  required: true,
  "unknown-field": true,
  "not-data": true,
  "expected-object": true,
  "expected-list": true,
  "expected-text": true,
  "expected-whole-number": true,
  "expected-yes-no": true,
  "empty-text": true,
  "too-few": true,
  "out-of-range": true,
  "duplicate-id": true,
  "unknown-type": true,
  "duplicate-choice": true,
  "gap-count": true,
  "answer-not-in-options": true,
  "not-a-permutation": true,
};

function violation(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the limit to be exceeded");
}

describe("learnMessages", () => {
  it("has text for every error code, every limit's warning and every issue code", () => {
    for (const code of Object.keys(ALL_ERROR_CODES)) {
      expect(learnMessages, code).toHaveProperty(`errors.${code}`);
    }
    for (const limit of Object.keys(learnLimitDefinitions)) {
      expect(learnMessages, limit).toHaveProperty(`warnings.${limit}`);
    }
    for (const code of Object.keys(ALL_ISSUE_CODES)) {
      expect(learnMessages, code).toHaveProperty(`validation.${code}`);
    }
  });

  it("has no validation text for an issue code that doesn't exist", () => {
    const issueKeys = Object.keys(learnMessages).filter((key) => key.startsWith("validation."));
    expect(issueKeys.sort()).toEqual(
      Object.keys(ALL_ISSUE_CODES)
        .map((code) => `validation.${code}`)
        .sort(),
    );
  });

  it("is a valid catalogue", () => {
    // createMessages throws on a malformed message in the SDK's own catalogue.
    expect(() => createMessages(learnMessages)).not.toThrow();
  });

  it("describes errors from their code and details, never their message", () => {
    const messages = createMessages(learnMessages);
    const policy = learnLimits.resolve();
    expect(messages.error(violation(() => policy.check("maxExercises", 900)))).toBe(
      "A set can have up to 500 exercises. Split the content into smaller sets.",
    );
    expect(messages.error(violation(() => policy.check("maxContentSize", 3_000_000)))).toBe(
      "This content is 3 MB, which is over the 2 MB limit. Split it into smaller sets.",
    );
    expect(messages.error(violation(() => policy.check("maxFileSize", 8_000_000)))).toBe(
      "This recording is 8 MB, which is over the 5 MB limit.",
    );
    const invalid = new LearnError("INVALID_DOCUMENT", "<script>from the content</script>", {
      details: { reason: "malformed-document", count: 3, issues: [] },
    });
    expect(messages.error(invalid)).toBe("This content has problems. Fix them, then try again.");
  });

  it("describes issues for a teacher, with their numbers and plurals", () => {
    const en = createMessages(learnMessages);
    expect(en.t("validation.too-few", { minimum: 2 })).toBe("Add at least 2 entries.");
    expect(en.t("validation.too-few", { minimum: 1 })).toBe("Add at least 1 entry.");
    expect(en.t("validation.unknown-field")).toBe(
      "This field isn't part of the content format. Remove it, or check its spelling.",
    );
    const de = createMessages(learnMessages, { locale: "de" });
    expect(de.t("warnings.maxExercises", { actual: 1_200 })).toBe(
      "This set has 1.200 exercises, and may be slow to open.",
    );
  });
});
