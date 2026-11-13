import { describe, expect, it } from "vitest";
import { applyProgressChanges, emptyProgress } from "./progress.js";

describe("applyProgressChanges", () => {
  it("appends attempts and replaces cards by item, leaving the snapshot given unchanged", () => {
    const scheduling = { scheduler: "fake", model: "doubling", version: 1, card: {} };
    const first = applyProgressChanges(emptyProgress, [
      { kind: "review", itemId: "w", rating: "good", scheduling, due: 10, at: 1 },
    ]);
    const second = applyProgressChanges(first, [
      {
        kind: "attempt",
        exerciseId: "e",
        answer: null,
        grade: { score: 0, max: 1, items: [false] },
        at: 2,
      },
      { kind: "review", itemId: "w", rating: "easy", scheduling, due: 99, at: 3 },
    ]);
    expect(first.cards).toEqual([{ itemId: "w", scheduling, due: 10 }]);
    expect(second.attempts).toHaveLength(1);
    expect(second.cards).toEqual([{ itemId: "w", scheduling, due: 99 }]);
    expect(emptyProgress).toEqual({ attempts: [], cards: [] });
    expect(Object.isFrozen(emptyProgress)).toBe(true);
  });
});
