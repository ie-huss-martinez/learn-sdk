import { throwIfAborted } from "../../core/errors/error-helpers.js";
import type { ProgressSnapshot } from "../../core/model/progress.js";
import { applyProgressChanges, emptyProgress } from "../../core/model/progress.js";
import type { ProgressStore } from "../../core/ports/progress-store.js";

/**
 * A {@link ProgressStore} that keeps progress in memory, for as long as the
 * store lives: the default, which stores nothing on the device (ADR 0003).
 * Snapshots it returns are copies.
 *
 * @example
 * ```ts
 * const progressStore = createMemoryProgressStore();
 * ```
 *
 * @public
 */
export function createMemoryProgressStore(): ProgressStore {
  const scopes = new Map<string, ProgressSnapshot>();
  return {
    async load(scope, options = {}) {
      throwIfAborted(options.signal);
      return structuredClone(scopes.get(scope) ?? emptyProgress);
    },
    async save(scope, changes, options = {}) {
      throwIfAborted(options.signal);
      scopes.set(
        scope,
        structuredClone(applyProgressChanges(scopes.get(scope) ?? emptyProgress, changes)),
      );
    },
    async clear(scope, options = {}) {
      throwIfAborted(options.signal);
      scopes.delete(scope);
    },
  };
}
