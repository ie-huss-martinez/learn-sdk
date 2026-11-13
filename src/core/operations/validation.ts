import type { ErrorDetailValue } from "@hussmartinez/sdk-core";
import { isLearnError } from "../errors/learn-error.js";
import type { LearnIssue } from "../errors/learn-issues.js";
import { MAX_ISSUE_KEY_LENGTH } from "../errors/learn-issues.js";
import type { LearnLimitPolicy } from "../errors/learn-limits.js";
import type { OptionalOption, ValidationContext } from "../model/validation-context.js";

/** At most this many issues are kept; the rest are only counted (ADR 0002). */
export const MAX_ISSUES = 100;

/** Where a validation run's issues go: kept up to MAX_ISSUES, all counted. */
export interface IssueSink {
  readonly issues: LearnIssue[];
  count: number;
}

export function createIssueSink(): IssueSink {
  return { issues: [], count: 0 };
}

/** The issues as plain error details: `{ count, issues }`, up to MAX_ISSUES kept (ADR 0002). */
export function issueDetails(sink: IssueSink): { count: number; issues: ErrorDetailValue[] } {
  return {
    count: sink.count,
    issues: sink.issues.map((issue) => ({
      path: [...issue.path],
      code: issue.code,
      ...(issue.details ? { details: { ...issue.details } } : {}),
    })),
  };
}

const isFull = (sink: IssueSink) => sink.count >= MAX_ISSUES;

/** Reads an own property as data: its value, `absent`, or `accessor` for a getter or setter. */
function ownData(target: object, key: PropertyKey): { value: unknown } | "absent" | "accessor" {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) {
    return "absent";
  }
  return "value" in descriptor ? { value: descriptor.value } : "accessor";
}

const keyName = (key: string | symbol) =>
  (typeof key === "symbol" ? String(key) : key).slice(0, MAX_ISSUE_KEY_LENGTH);

/**
 * Creates the root validation context for one run.
 *
 * @internal
 */
export function createValidationContext(
  policy: LearnLimitPolicy,
  sink: IssueSink = createIssueSink(),
  path: readonly (string | number)[] = [],
): ValidationContext {
  const issue: ValidationContext["issue"] = (code, details) => {
    sink.count++;
    if (sink.issues.length < MAX_ISSUES) {
      sink.issues.push(details ? { path, code, details } : { path, code });
    }
  };
  const absent = (options: OptionalOption | undefined) => {
    if (!options?.optional) {
      issue("required");
    }
    return undefined;
  };

  return {
    path,
    at: (...segments) => createValidationContext(policy, sink, [...path, ...segments]),
    issue,
    fields(value, names, options) {
      if (value === undefined) {
        return absent(options);
      }
      try {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          issue("expected-object");
          return undefined;
        }
        const known = new Set<PropertyKey>(names);
        const result: Partial<Record<(typeof names)[number], unknown>> = Object.create(null);
        for (const key of Reflect.ownKeys(value)) {
          if (!known.has(key)) {
            createValidationContext(policy, sink, [...path, keyName(key)]).issue("unknown-field");
            if (isFull(sink)) {
              break;
            }
          }
        }
        for (const name of names) {
          const read = ownData(value, name);
          if (read === "accessor") {
            createValidationContext(policy, sink, [...path, name]).issue("not-data");
          } else if (read !== "absent") {
            result[name] = read.value;
          }
        }
        return result;
      } catch {
        // A Proxy's trap threw, or a revoked Proxy: never trusted, never a crash.
        issue("not-data");
        return undefined;
      }
    },
    list(value, options) {
      if (value === undefined) {
        return absent(options);
      }
      try {
        if (!Array.isArray(value)) {
          issue("expected-list");
          return undefined;
        }
        const lengthRead = ownData(value, "length");
        const length = typeof lengthRead === "object" ? lengthRead.value : undefined;
        if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) {
          issue("not-data");
          return undefined;
        }
        policy.check(options.limit, length);
        if (options.minimum !== undefined && length < options.minimum) {
          issue("too-few", { minimum: options.minimum });
        }
        const entries: unknown[] = [];
        for (let index = 0; index < length; index++) {
          const read = ownData(value, index);
          if (read === "accessor") {
            createValidationContext(policy, sink, [...path, index]).issue("not-data");
            entries.push(undefined);
          } else {
            entries.push(read === "absent" ? undefined : read.value);
          }
        }
        return entries;
      } catch (error) {
        if (isLimitError(error)) {
          throw error;
        }
        issue("not-data");
        return undefined;
      }
    },
    text(value, options) {
      if (value === undefined) {
        return absent(options);
      }
      if (typeof value !== "string") {
        issue("expected-text");
        return undefined;
      }
      policy.check("maxTextLength", value.length);
      if (!options?.allowEmpty && value.trim() === "") {
        issue("empty-text");
        return undefined;
      }
      return value;
    },
    wholeNumber(value, options) {
      if (value === undefined) {
        return absent(options);
      }
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        issue("expected-whole-number");
        return undefined;
      }
      return value;
    },
    yesNo(value, options) {
      if (value === undefined) {
        return absent(options);
      }
      if (typeof value !== "boolean") {
        issue("expected-yes-no");
        return undefined;
      }
      return value;
    },
  };
}

/** Limit errors carry `details.limit`; anything else thrown while reading a list is a Proxy or data problem. */
function isLimitError(error: unknown): boolean {
  return isLearnError(error) && typeof error.details?.["limit"] === "string";
}
