import { LearnError } from "../errors/learn-error.js";
import type { LearnLimitPolicy } from "../errors/learn-limits.js";
import { type IssueSink, issueDetails } from "./validation.js";

/** UTF-8 size of a string, stopping as soon as it passes `stopAbove`. */
export function utf8Size(text: string, stopAbove: number): number {
  if (text.length > stopAbove) {
    return text.length; // every code unit is at least one byte
  }
  let size = 0;
  for (let index = 0; index < text.length && size <= stopAbove; index++) {
    const unit = text.charCodeAt(index);
    if (unit < 0x80) {
      size += 1;
    } else if (unit < 0x800) {
      size += 2;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      size += 4; // a surrogate pair is one four-byte character
      index++;
    } else {
      size += 3;
    }
  }
  return size;
}

/**
 * Parses a document given as text, after checking its size (ADR 0002): a
 * string over `maxContentSize` throws that limit's error, and text that
 * isn't JSON is `INVALID_DOCUMENT` with the reason `not-json`. Anything
 * else is returned as it is, for validation by shape.
 */
export function parseDocumentText(input: unknown, policy: LearnLimitPolicy): unknown {
  if (typeof input !== "string") {
    return input;
  }
  policy.check("maxContentSize", utf8Size(input, policy.limits.maxContentSize.maximum));
  try {
    return JSON.parse(input);
  } catch {
    throw new LearnError("INVALID_DOCUMENT", "The document isn't JSON.", {
      details: { reason: "not-json" },
    });
  }
}

/**
 * Checks a document's `format` and `version` (sdk-core ADR 0045, ADR 0006):
 * another format, or a version this release doesn't read, is
 * `UNSUPPORTED_FORMAT`. A missing version of the right format is left to
 * validation, as a `required` issue.
 */
export function checkFormat(
  fields: { format?: unknown; version?: unknown },
  format: string,
  supported: readonly number[],
): void {
  const found = {
    ...(typeof fields.format === "string"
      ? { format: [...fields.format].slice(0, 64).join("") }
      : {}),
    ...(typeof fields.version === "number" && Number.isFinite(fields.version)
      ? { version: fields.version }
      : {}),
    supported: [...supported],
  };
  if (fields.format !== format) {
    throw new LearnError("UNSUPPORTED_FORMAT", `This isn't an ${format} document.`, {
      details: { reason: "unknown-format", ...found },
    });
  }
  if (fields.version !== undefined && !supported.includes(fields.version as number)) {
    throw new LearnError("UNSUPPORTED_FORMAT", `This ${format} version isn't supported.`, {
      details: { reason: "unknown-format-version", ...found },
    });
  }
}

/** Throws the issues collected so far as `INVALID_DOCUMENT` (`malformed-document`). */
export function throwInvalidDocument(sink: IssueSink): never {
  throw new LearnError(
    "INVALID_DOCUMENT",
    sink.count === 1 ? "The document has a problem." : `The document has ${sink.count} problems.`,
    { details: { reason: "malformed-document", ...issueDetails(sink) } },
  );
}
