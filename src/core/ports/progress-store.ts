import type { ProgressChange, ProgressSnapshot } from "../model/progress.js";
import type { LearnCallOptions } from "./options.js";

/**
 * Where learners' progress is kept: the host's choice (ADR 0003). The SDK
 * holds progress only in memory, and reads and writes it through this port.
 * A scope is the host's own key, such as a learner and a course together, so
 * learners sharing a device never see each other's progress.
 *
 * Contract, checked by the SDK's contract tests for every adapter:
 * - `load` of a scope never saved resolves to an empty snapshot;
 * - `save` applies changes as {@link applyProgressChanges} does, and a later
 *   `load` of that scope sees them; other scopes don't;
 * - snapshots are copies: changing one never changes the store;
 * - `clear` removes a scope's progress;
 * - calls reject with `ABORTED` when `signal` aborts before they settle.
 *
 * @public
 */
export interface ProgressStore {
  load(scope: string, options?: LearnCallOptions): Promise<ProgressSnapshot>;
  save(
    scope: string,
    changes: readonly ProgressChange[],
    options?: LearnCallOptions,
  ): Promise<void>;
  clear(scope: string, options?: LearnCallOptions): Promise<void>;
}
