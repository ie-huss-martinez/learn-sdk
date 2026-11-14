import { isLearnError } from "../core/errors/learn-error.js";

/**
 * The test functions a contract suite registers its tests with. Vitest's,
 * Jest's and `node:test`'s `describe` and `it` all fit, so the package
 * doesn't depend on a test framework. Each test throws a
 * `ContractViolation` error with a clear message when the adapter breaks
 * its port's contract.
 *
 * @public
 */
export interface ContractTestApi {
  describe(name: string, body: () => void): void;
  it(name: string, body: () => Promise<void>): void;
}

class ContractViolation extends Error {
  override readonly name = "ContractViolation";
}

/** Throws a ContractViolation unless `condition` holds. */
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new ContractViolation(message);
  }
}

/** Deep equality for plain JSON-like data, ignoring key order. */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameData(value, b[index]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every(
      (key) =>
        Object.hasOwn(b, key) &&
        sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

/** Awaits a call that must reject with a LearnError of this code. */
export async function rejectsWith(
  call: () => Promise<unknown>,
  code: string,
  what: string,
): Promise<void> {
  let error: unknown;
  try {
    await call();
  } catch (thrown) {
    error = thrown;
  }
  check(error !== undefined, `${what} resolved; it must reject with a LearnError "${code}".`);
  check(
    isLearnError(error) && error.code === code,
    `${what} rejected with ${describeError(error)}; it must reject with a LearnError "${code}".`,
  );
}

/** Calls a function that must throw a LearnError of this code. */
export function throwsWith(call: () => unknown, code: string, what: string, reason?: string): void {
  let error: unknown;
  try {
    call();
  } catch (thrown) {
    error = thrown;
  }
  check(error !== undefined, `${what} returned; it must throw a LearnError "${code}".`);
  check(
    isLearnError(error) && error.code === code,
    `${what} threw ${describeError(error)}; it must throw a LearnError "${code}".`,
  );
  if (reason !== undefined) {
    const found = isLearnError(error) ? error.details?.["reason"] : undefined;
    check(found === reason, `${what} gave the reason "${String(found)}"; it must be "${reason}".`);
  }
}

const describeError = (error: unknown) =>
  isLearnError(error)
    ? `a LearnError "${error.code}"`
    : error instanceof Error
      ? `a ${error.name}`
      : "a non-error value";

/** An aborted signal. */
export function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
}
