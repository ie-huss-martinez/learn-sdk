import { describe, expect, it } from "vitest";
import type { ProgressChange } from "../../src/core/model/progress.js";
import type { ProgressStore } from "../../src/core/ports/progress-store.js";

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
  scheduling: { scheduler: "fake", model: "doubling", version: 1, card: { reviews: 1 } },
  due,
  at: 1,
});

/** The ProgressStore contract (ADR 0001, ADR 0003), run against an adapter. */
export function progressStoreContract(name: string, create: () => ProgressStore): void {
  describe(`${name} meets the ProgressStore contract`, () => {
    it("loads an empty snapshot for a scope never saved", async () => {
      expect(await create().load("never")).toEqual({ attempts: [], cards: [] });
    });

    it("applies saved changes in order: attempts append, a review replaces its card", async () => {
      const store = create();
      await store.save("s", [attempt("a", 1), review("word", 10)]);
      await store.save("s", [attempt("b", 2), review("word", 20)]);
      expect(await store.load("s")).toEqual({
        attempts: [
          {
            exerciseId: "a",
            answer: { selected: [0] },
            grade: { score: 1, max: 1, items: [true] },
            at: 1,
          },
          {
            exerciseId: "b",
            answer: { selected: [0] },
            grade: { score: 1, max: 1, items: [true] },
            at: 2,
          },
        ],
        cards: [
          {
            itemId: "word",
            scheduling: { scheduler: "fake", model: "doubling", version: 1, card: { reviews: 1 } },
            due: 20,
          },
        ],
      });
    });

    it("keeps scopes apart, so learners sharing a device never see each other's progress", async () => {
      const store = create();
      await store.save("learner-1", [attempt("a", 1)]);
      expect((await store.load("learner-2")).attempts).toEqual([]);
    });

    it("returns copies: changing a snapshot never changes the store", async () => {
      const store = create();
      await store.save("s", [attempt("a", 1)]);
      const snapshot = await store.load("s");
      (snapshot.attempts as unknown[]).push("tampered");
      (snapshot.attempts[0] as { grade: { score: number } }).grade.score = 99;
      expect(await store.load("s")).toEqual({
        attempts: [
          {
            exerciseId: "a",
            answer: { selected: [0] },
            grade: { score: 1, max: 1, items: [true] },
            at: 1,
          },
        ],
        cards: [],
      });
    });

    it("clears a scope", async () => {
      const store = create();
      await store.save("s", [attempt("a", 1)]);
      await store.clear("s");
      expect(await store.load("s")).toEqual({ attempts: [], cards: [] });
    });

    it("rejects with ABORTED when the signal has aborted", async () => {
      const store = create();
      const controller = new AbortController();
      controller.abort();
      for (const call of [
        store.load("s", { signal: controller.signal }),
        store.save("s", [attempt("a", 1)], { signal: controller.signal }),
        store.clear("s", { signal: controller.signal }),
      ]) {
        await expect(call).rejects.toMatchObject({ name: "LearnError", code: "ABORTED" });
      }
    });
  });
}
