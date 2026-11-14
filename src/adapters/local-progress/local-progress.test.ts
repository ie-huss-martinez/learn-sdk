import { describe, expect, it } from "vitest";
import { isLearnError } from "../../core/errors/learn-error.js";
import type { ProgressChange } from "../../core/model/progress.js";
import { defineProgressStoreContract } from "../../testing/progress-store-contract.js";
import { createLocalProgressStore, type ProgressStorage } from "./local-progress.js";

/** An in-memory Web Storage stand-in, for the unit project, which has no DOM. */
function memoryStorage(): ProgressStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

defineProgressStoreContract(
  "createLocalProgressStore",
  () => createLocalProgressStore({ namespace: "test", storage: memoryStorage() }),
  { describe, it },
);

const attempt: ProgressChange = {
  kind: "attempt",
  exerciseId: "e",
  answer: { selected: [1] },
  grade: { score: 0, max: 1, items: [false] },
  at: 1_700_000_000_000,
};
const KEY = "hm-learn:v1:app:learner%201";

describe("createLocalProgressStore", () => {
  it("stores an hm-learn-progress document under a namespaced, versioned key", async () => {
    const storage = memoryStorage();
    await createLocalProgressStore({ namespace: "app", storage }).save("learner 1", [attempt]);
    expect([...storage.data.keys()]).toEqual([KEY]);
    expect(JSON.parse(storage.data.get(KEY) ?? "")).toMatchObject({
      format: "hm-learn-progress",
      version: 1,
      cards: [],
    });
  });

  it("discards what it can't trust on load, with only the reason, and loads empty", async () => {
    const doc = (fields: Record<string, unknown>) =>
      JSON.stringify({
        format: "hm-learn-progress",
        version: 1,
        attempts: [],
        cards: [],
        ...fields,
      });
    const goodAttempt = {
      exerciseId: "e",
      answer: 1,
      grade: { score: 0, max: 1, items: [false] },
      at: 1_700_000_000_000,
    };
    for (const stored of [
      "{not json",
      JSON.stringify({ format: "hm-learn-progress", version: 2, attempts: [], cards: [] }),
      JSON.stringify({ format: "hm-learn-content", version: 1, attempts: [], cards: [] }),
      doc({ extra: 1 }),
      doc({ attempts: [{ ...goodAttempt, grade: { score: 2, max: 1, items: [] } }] }),
      doc({
        cards: [
          {
            itemId: "w",
            due: -1,
            scheduling: { scheduler: "s", model: "m", version: 1, card: {} },
          },
        ],
      }),
      doc({ attempts: "x" }),
      doc({ attempts: [goodAttempt] }).replace(
        '"exerciseId":',
        '"__proto__":{"x":1},"exerciseId":',
      ),
    ]) {
      const storage = memoryStorage();
      storage.data.set(KEY, stored);
      const reasons: string[] = [];
      const store = createLocalProgressStore({
        namespace: "app",
        storage,
        onDiscard: (r) => reasons.push(r),
      });
      expect(await store.load("learner 1"), stored).toEqual({ attempts: [], cards: [] });
      expect(reasons, stored).toEqual(["invalid"]);
    }
    expect(({} as { x?: number }).x).toBeUndefined();
  });

  it("reads back what it stored", async () => {
    const storage = memoryStorage();
    await createLocalProgressStore({ namespace: "app", storage }).save("learner 1", [attempt]);
    const reasons: string[] = [];
    const store = createLocalProgressStore({
      namespace: "app",
      storage,
      onDiscard: (r) => reasons.push(r),
    });
    expect((await store.load("learner 1")).attempts).toHaveLength(1);
    expect(reasons).toEqual([]);
  });

  it("discards stored progress over the size limit on load, and refuses to save past it", async () => {
    const storage = memoryStorage();
    storage.data.set(KEY, " ".repeat(2_000));
    const reasons: string[] = [];
    const store = createLocalProgressStore({
      namespace: "app",
      storage,
      limits: { maxContentSize: 1_000 },
      onDiscard: (r) => reasons.push(r),
    });
    expect(await store.load("learner 1")).toEqual({ attempts: [], cards: [] });
    expect(reasons).toEqual(["too-large"]);
    const big = { ...attempt, answer: { text: "x".repeat(2_000) } };
    await expect(store.save("learner 1", [big])).rejects.toMatchObject({
      code: "CONTENT_TOO_LARGE",
    });
  });

  it("reports a full or disabled storage as STORAGE_UNAVAILABLE", async () => {
    const full: ProgressStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {
        throw new DOMException("Denied", "SecurityError");
      },
    };
    const store = createLocalProgressStore({ namespace: "app", storage: full });
    await expect(store.save("s", [attempt])).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    await expect(store.clear("s")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });

  it("looks up localStorage only when used, and reports its absence", async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    let touched = 0;
    try {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        get() {
          touched++;
          return undefined;
        },
      });
      const store = createLocalProgressStore({ namespace: "app" });
      expect(touched).toBe(0);
      let error: unknown;
      try {
        await store.load("s");
      } catch (thrown) {
        error = thrown;
      }
      expect(touched).toBe(1);
      expect(isLearnError(error, "UNSUPPORTED_ENVIRONMENT")).toBe(true);
    } finally {
      if (saved) {
        Object.defineProperty(globalThis, "localStorage", saved);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });

  it("refuses an empty namespace or scope", async () => {
    expect(() => createLocalProgressStore({ namespace: "" })).toThrow(TypeError);
    await expect(
      createLocalProgressStore({ namespace: "a", storage: memoryStorage() }).load(""),
    ).rejects.toThrow(TypeError);
  });
});
