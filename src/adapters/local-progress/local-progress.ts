import { asLearnError, throwIfAborted } from "../../core/errors/error-helpers.js";
import { isLearnError, LearnError } from "../../core/errors/learn-error.js";
import { type LearnLimitOverrides, learnLimits } from "../../core/errors/learn-limits.js";
import { parseProgress } from "../../core/model/parse-progress.js";
import {
  applyProgressChanges,
  emptyProgress,
  type ProgressSnapshot,
  toProgressDocument,
} from "../../core/model/progress.js";
import type { ProgressStore } from "../../core/ports/progress-store.js";

/** The storage layout's version, in every key; each value is an `hm-learn-progress` document (ADR 0006). */
const KEY_PREFIX = "hm-learn:v1:";

/**
 * The part of the Web Storage API the adapter uses, so hosts and tests can
 * pass another implementation.
 *
 * @public
 */
export type ProgressStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Why stored progress was discarded on load: too large to read, or not a
 * valid stored snapshot.
 *
 * @public
 */
export type ProgressDiscardReason = "too-large" | "invalid";

/**
 * Options for {@link createLocalProgressStore}.
 *
 * @public
 */
export interface LocalProgressStoreOptions {
  /** Your app's key prefix, such as your app's name, so it never mixes with other apps' progress on the same site. */
  readonly namespace: string;
  /** Where to store. Defaults to the page's `localStorage`, looked up on first use. */
  readonly storage?: ProgressStorage;
  /** The host's limit settings; `maxContentSize` bounds each stored scope. */
  readonly limits?: LearnLimitOverrides;
  /** Called when stored progress is discarded on load, with only the reason, never the data. */
  readonly onDiscard?: (reason: ProgressDiscardReason) => void;
}

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** UTF-8 size of a string. */
const utf8Size = (text: string) => new TextEncoder().encode(text).length;

/**
 * A {@link ProgressStore} that keeps progress on the device, in
 * `localStorage`: opt-in, never the default (ADR 0003).
 *
 * - **Keys** are namespaced and versioned: `hm-learn:v1:<namespace>:<scope>`.
 *   Choose scopes per learner, so learners sharing a device never see each
 *   other's progress, and call `clear(scope)` when a learner signs out.
 * - **What it reads back is untrusted:** each value is an `hm-learn-progress`
 *   document, read with {@link parseProgress}: size-checked against
 *   `maxContentSize`, parsed, and checked record by record. Anything wrong
 *   discards that scope's progress, calls `onDiscard` with the reason, and
 *   loads empty, without throwing.
 * - **Saving** refuses progress larger than `maxContentSize` with
 *   `CONTENT_TOO_LARGE`, so it can always be read back. A full or disabled
 *   storage, such as one in private browsing, is `STORAGE_UNAVAILABLE`.
 * - **Not encrypted:** anyone with access to the browser profile can read
 *   it. For anything more, use your own store.
 *
 * @example
 * ```ts
 * const progressStore = createLocalProgressStore({
 *   namespace: "my-app",
 *   onDiscard: (reason) => track("progress-discarded", { reason }),
 * });
 * await progressStore.save(`learner-${id}`, changes);
 * ```
 *
 * @param options - The namespace, and optionally the storage, limits and discard callback.
 * @throws `TypeError` for an empty namespace.
 * @public
 */
export function createLocalProgressStore(options: LocalProgressStoreOptions): ProgressStore {
  if (!isText(options.namespace)) {
    throw new TypeError("A local progress store needs a namespace.");
  }
  const policy = learnLimits.resolve(options.limits);
  const keyFor = (scope: string) => {
    if (!isText(scope)) {
      throw new TypeError("A progress scope must be a non-empty string.");
    }
    return `${KEY_PREFIX}${encodeURIComponent(options.namespace)}:${encodeURIComponent(scope)}`;
  };
  const storage = (): ProgressStorage => {
    if (options.storage) {
      return options.storage;
    }
    const local = (globalThis as { localStorage?: ProgressStorage }).localStorage;
    if (!local) {
      throw new LearnError("UNSUPPORTED_ENVIRONMENT", "localStorage isn't available here.", {
        details: { feature: "localStorage" },
      });
    }
    return local;
  };
  const unavailable = (cause: unknown) =>
    new LearnError("STORAGE_UNAVAILABLE", "The device's storage refused the operation.", {
      cause: asLearnError(cause),
    });

  const read = (key: string): ProgressSnapshot => {
    let text: string | null;
    try {
      text = storage().getItem(key);
    } catch (error) {
      if (error instanceof LearnError) {
        throw error;
      }
      throw unavailable(error);
    }
    if (text === null) {
      return emptyProgress;
    }
    try {
      return parseProgress(text, options.limits ? { limits: options.limits } : {});
    } catch (error) {
      if (isLearnError(error, "CONTENT_TOO_LARGE")) {
        options.onDiscard?.("too-large");
        return emptyProgress;
      }
      if (isLearnError(error)) {
        options.onDiscard?.("invalid");
        return emptyProgress;
      }
      throw error;
    }
  };

  return {
    async load(scope, callOptions = {}) {
      throwIfAborted(callOptions.signal);
      return structuredClone(read(keyFor(scope)));
    },
    async save(scope, changes, callOptions = {}) {
      throwIfAborted(callOptions.signal);
      const key = keyFor(scope);
      const next = applyProgressChanges(read(key), changes);
      const text = JSON.stringify(toProgressDocument(next));
      policy.check("maxContentSize", utf8Size(text));
      try {
        storage().setItem(key, text);
      } catch (error) {
        if (error instanceof LearnError) {
          throw error;
        }
        throw unavailable(error);
      }
    },
    async clear(scope, callOptions = {}) {
      throwIfAborted(callOptions.signal);
      try {
        storage().removeItem(keyFor(scope));
      } catch (error) {
        if (error instanceof LearnError) {
          throw error;
        }
        throw unavailable(error);
      }
    },
  };
}
