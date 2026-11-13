import { asLearnError, throwIfAborted } from "../../core/errors/error-helpers.js";
import { LearnError } from "../../core/errors/learn-error.js";
import { type LearnLimitOverrides, learnLimits } from "../../core/errors/learn-limits.js";
import type { Grade } from "../../core/model/content.js";
import {
  type AttemptRecord,
  applyProgressChanges,
  type CardRecord,
  emptyProgress,
  type ProgressSnapshot,
} from "../../core/model/progress.js";
import type { ProgressStore } from "../../core/ports/progress-store.js";

/** The stored format's version, also in every key, so a new format never reads an old one by mistake. */
const FORMAT_VERSION = 1;
const KEY_PREFIX = `hm-learn:v${FORMAT_VERSION}:`;

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
const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

function readGrade(value: unknown): Grade | undefined {
  if (!isObject(value) || !hasOnly(value, ["score", "max", "items"])) {
    return undefined;
  }
  const { score, max, items } = value;
  if (
    !Number.isSafeInteger(score) ||
    !Number.isSafeInteger(max) ||
    (score as number) < 0 ||
    (score as number) > (max as number) ||
    !Array.isArray(items) ||
    !items.every((item) => typeof item === "boolean")
  ) {
    return undefined;
  }
  return { score: score as number, max: max as number, items: [...(items as boolean[])] };
}

function readAttempt(value: unknown): AttemptRecord | undefined {
  if (!isObject(value) || !hasOnly(value, ["exerciseId", "answer", "grade", "at"])) {
    return undefined;
  }
  const grade = readGrade(value["grade"]);
  if (!isText(value["exerciseId"]) || !grade || !isTime(value["at"]) || !("answer" in value)) {
    return undefined;
  }
  return { exerciseId: value["exerciseId"], answer: value["answer"], grade, at: value["at"] };
}

function readCard(value: unknown): CardRecord | undefined {
  if (!isObject(value) || !hasOnly(value, ["itemId", "scheduling", "due"])) {
    return undefined;
  }
  const scheduling = value["scheduling"];
  if (
    !isText(value["itemId"]) ||
    !isTime(value["due"]) ||
    !isObject(scheduling) ||
    !hasOnly(scheduling, ["scheduler", "model", "version", "card"]) ||
    !isText(scheduling["scheduler"]) ||
    !isText(scheduling["model"]) ||
    !Number.isSafeInteger(scheduling["version"]) ||
    !("card" in scheduling)
  ) {
    return undefined;
  }
  return {
    itemId: value["itemId"],
    scheduling: {
      scheduler: scheduling["scheduler"],
      model: scheduling["model"],
      version: scheduling["version"] as number,
      card: scheduling["card"],
    },
    due: value["due"],
  };
}

/**
 * Reads a stored snapshot as untrusted input (ADR 0003): it comes back from
 * the device, where anything with access to the page could have changed it.
 * Every record must be well formed, or the whole snapshot is refused.
 */
function readSnapshot(text: string): ProgressSnapshot | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    !isObject(value) ||
    !hasOnly(value, ["version", "attempts", "cards"]) ||
    value["version"] !== FORMAT_VERSION
  ) {
    return undefined;
  }
  const { attempts, cards } = value;
  if (!Array.isArray(attempts) || !Array.isArray(cards)) {
    return undefined;
  }
  const readAttempts = attempts.map(readAttempt);
  const readCards = cards.map(readCard);
  if (readAttempts.some((attempt) => !attempt) || readCards.some((card) => !card)) {
    return undefined;
  }
  return { attempts: readAttempts as AttemptRecord[], cards: readCards as CardRecord[] };
}

/** UTF-8 size of a string. */
const utf8Size = (text: string) => new TextEncoder().encode(text).length;

/**
 * A {@link ProgressStore} that keeps progress on the device, in
 * `localStorage`: opt-in, never the default (ADR 0003).
 *
 * - **Keys** are namespaced and versioned: `hm-learn:v1:<namespace>:<scope>`.
 *   Choose scopes per learner, so learners sharing a device never see each
 *   other's progress, and call `clear(scope)` when a learner signs out.
 * - **What it reads back is untrusted:** it's size-checked against
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
    if (utf8Size(text) > policy.limits.maxContentSize.maximum) {
      options.onDiscard?.("too-large");
      return emptyProgress;
    }
    const snapshot = readSnapshot(text);
    if (!snapshot) {
      options.onDiscard?.("invalid");
      return emptyProgress;
    }
    return snapshot;
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
      const text = JSON.stringify({
        version: FORMAT_VERSION,
        attempts: next.attempts,
        cards: next.cards,
      });
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
