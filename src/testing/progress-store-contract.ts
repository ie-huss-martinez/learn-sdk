import type { ProgressChange } from "../core/model/progress.js";
import type { ProgressStore } from "../core/ports/progress-store.js";
import { abortedSignal, type ContractTestApi, check, rejectsWith, sameData } from "./contract.js";

const AT = 1_767_225_600_000; // 2026-01-01
const scheduling = { scheduler: "contract", model: "test", version: 1, card: { n: 1 } };
const attempt = (exerciseId: string, at: number): ProgressChange => ({
  kind: "attempt",
  exerciseId,
  answer: { selected: [0] },
  grade: { score: 1, max: 1, items: [true] },
  at,
});
const review = (itemId: string, due: number): ProgressChange => ({
  kind: "review",
  itemId,
  rating: "good",
  scheduling,
  due,
  at: AT,
});
const attemptRecord = (exerciseId: string, at: number) => ({
  exerciseId,
  answer: { selected: [0] },
  grade: { score: 1, max: 1, items: [true] },
  at,
});

/**
 * Registers the `ProgressStore` (from `@hussmartinez/learn-sdk`) contract's tests for an adapter (ADR
 * 0001, ADR 0003). `make` builds a fresh, empty store for each test.
 *
 * @example
 * ```ts
 * import { describe, it } from "vitest";
 * import { defineProgressStoreContract } from "@hussmartinez/learn-sdk/testing";
 *
 * defineProgressStoreContract("my database store", () => createMyStore(freshDatabase()), { describe, it });
 * ```
 *
 * @param name - The adapter's name, for the test titles.
 * @param make - Builds a fresh, empty store.
 * @param test - The test framework's `describe` and `it`.
 * @public
 */
export function defineProgressStoreContract(
  name: string,
  make: () => ProgressStore | Promise<ProgressStore>,
  test: ContractTestApi,
): void {
  test.describe(`${name} meets the ProgressStore contract`, () => {
    test.it("loads an empty snapshot for a scope never saved", async () => {
      const snapshot = await (await make()).load("never-saved");
      check(
        sameData(snapshot, { attempts: [], cards: [] }),
        "load of a scope never saved must be empty.",
      );
    });

    test.it(
      "applies saved changes in order: attempts append, a review replaces its card",
      async () => {
        const store = await make();
        await store.save("s", [attempt("a", AT), review("word", AT + 10)]);
        await store.save("s", [attempt("b", AT + 1), review("word", AT + 20)]);
        const snapshot = await store.load("s");
        check(
          sameData(snapshot.attempts, [attemptRecord("a", AT), attemptRecord("b", AT + 1)]),
          "attempts must be kept, in the order they were saved.",
        );
        check(
          sameData(snapshot.cards, [{ itemId: "word", scheduling, due: AT + 20 }]),
          "a review must replace its item's card.",
        );
      },
    );

    test.it("keeps scopes apart", async () => {
      const store = await make();
      await store.save("learner-1", [attempt("a", AT)]);
      check(
        (await store.load("learner-2")).attempts.length === 0,
        "another scope's progress must not be visible.",
      );
    });

    test.it("returns copies: changing a snapshot never changes the store", async () => {
      const store = await make();
      await store.save("s", [attempt("a", AT)]);
      const snapshot = await store.load("s");
      try {
        (snapshot.attempts as unknown[]).push("tampered");
        (snapshot.attempts[0] as { grade: { score: number } }).grade.score = 99;
      } catch {
        // A frozen snapshot is fine too.
      }
      check(
        sameData(await store.load("s"), { attempts: [attemptRecord("a", AT)], cards: [] }),
        "changing a loaded snapshot must not change what the store holds.",
      );
    });

    test.it("clears a scope", async () => {
      const store = await make();
      await store.save("s", [attempt("a", AT)]);
      await store.clear("s");
      check(
        sameData(await store.load("s"), { attempts: [], cards: [] }),
        "clear must remove a scope's progress.",
      );
    });

    test.it("rejects with ABORTED when the signal has aborted", async () => {
      const store = await make();
      await rejectsWith(
        () => store.load("s", { signal: abortedSignal() }),
        "ABORTED",
        "load with an aborted signal",
      );
      await rejectsWith(
        () => store.save("s", [attempt("a", AT)], { signal: abortedSignal() }),
        "ABORTED",
        "save with an aborted signal",
      );
      await rejectsWith(
        () => store.clear("s", { signal: abortedSignal() }),
        "ABORTED",
        "clear with an aborted signal",
      );
    });
  });
}
