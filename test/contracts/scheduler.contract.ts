import { describe, expect, it } from "vitest";
import { isLearnError } from "../../src/core/errors/learn-error.js";
import type { Rating, SchedulingState } from "../../src/core/model/scheduling.js";
import type { Scheduler } from "../../src/core/ports/scheduler.js";

const NOW = Date.UTC(2026, 0, 1);
const RATINGS: readonly Rating[] = ["again", "hard", "good", "easy"];

/** The Scheduler contract (ADR 0001, ADR 0004), run against an adapter. */
export function schedulerContract(name: string, create: () => Scheduler): void {
  describe(`${name} meets the Scheduler contract`, () => {
    it("labels its states with its id, a model and a version", () => {
      const scheduler = create();
      const { state } = scheduler.initial(NOW);
      expect(state.scheduler).toBe(scheduler.id);
      expect(typeof state.model).toBe("string");
      expect(Number.isInteger(state.version)).toBe(true);
    });

    it("is deterministic, and never schedules before now", () => {
      const scheduler = create();
      let { state } = scheduler.initial(NOW);
      let now = NOW;
      for (const rating of ["good", "good", "again", "hard", "easy", "good"] as const) {
        const first = scheduler.review(state, rating, now);
        expect(create().review(state, rating, now)).toEqual(first);
        expect(first.due).toBeGreaterThanOrEqual(now);
        ({ state } = first);
        now = first.due;
      }
    });

    it("never gives a better rating an earlier due time", () => {
      const scheduler = create();
      let { state } = scheduler.initial(NOW);
      state = scheduler.review(state, "good", NOW).state;
      const later = NOW + 3 * 24 * 60 * 60 * 1000;
      const dues = RATINGS.map((rating) => scheduler.review(state, rating, later).due);
      expect([...dues].sort((a, b) => a - b)).toEqual(dues);
    });

    it("keeps its meaning through JSON, as stored states do", () => {
      const scheduler = create();
      const { state } = scheduler.review(scheduler.initial(NOW).state, "good", NOW);
      const stored = JSON.parse(JSON.stringify(state)) as SchedulingState;
      expect(scheduler.review(stored, "good", NOW + 1000)).toEqual(
        scheduler.review(state, "good", NOW + 1000),
      );
    });

    it("refuses a state from another scheduler, model or version", () => {
      const scheduler = create();
      const { state } = scheduler.initial(NOW);
      for (const foreign of [
        { ...state, scheduler: `${state.scheduler}-other` },
        { ...state, model: `${state.model}-other` },
        { ...state, version: state.version + 1 },
        { ...state, card: null },
      ]) {
        let error: unknown;
        try {
          scheduler.review(foreign, "good", NOW);
        } catch (thrown) {
          error = thrown;
        }
        expect(isLearnError(error, "UNSUPPORTED_SCHEDULING_STATE"), JSON.stringify(foreign)).toBe(
          true,
        );
      }
    });
  });
}
