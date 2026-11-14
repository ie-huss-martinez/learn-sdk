import { describe, expect, it } from "vitest";
import { isLearnError } from "../../core/errors/learn-error.js";
import type { SchedulingState } from "../../core/model/scheduling.js";
import { defineSchedulerContract } from "../../testing/scheduler-contract.js";
import { createFsrsScheduler } from "./fsrs-scheduler.js";

defineSchedulerContract("createFsrsScheduler", () => createFsrsScheduler(), { describe, it });

const NOW = Date.UTC(2026, 0, 1);

describe("createFsrsScheduler", () => {
  it("runs FSRS-7, with the due times ADR 0004 measured in four runtimes", () => {
    const scheduler = createFsrsScheduler();
    let { state } = scheduler.initial(NOW);
    expect(state).toMatchObject({ scheduler: "fsrs", model: "FSRS-7", version: 1 });
    const dues: string[] = [];
    let now = NOW;
    for (const rating of ["good", "good", "again", "good", "easy"] as const) {
      const next = scheduler.review(state, rating, now);
      dues.push(new Date(next.due).toISOString());
      ({ state } = next);
      now = next.due;
    }
    expect(dues).toEqual([
      "2026-01-05T18:39:55.164Z",
      "2026-01-31T22:40:53.903Z",
      "2026-01-31T23:53:49.945Z",
      "2026-02-01T18:04:12.454Z",
      "2026-02-04T11:59:51.274Z",
    ]);
  });

  it("stores plain JSON with times in milliseconds", () => {
    const { state, due } = createFsrsScheduler().review(
      createFsrsScheduler().initial(NOW).state,
      "good",
      NOW,
    );
    const card = state.card as Record<string, unknown>;
    expect(card["dueAt"]).toBe(due);
    expect(card["lastReviewAt"]).toBe(NOW);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("refuses malformed cards with UNSUPPORTED_SCHEDULING_STATE", () => {
    const scheduler = createFsrsScheduler();
    const { state } = scheduler.review(scheduler.initial(NOW).state, "good", NOW);
    const card = state.card as Record<string, unknown>;
    for (const broken of [
      { ...card, stability: "3" },
      { ...card, state: 9 },
      { ...card, scheduleStatus: "relearning-forever" },
      { ...card, dueAt: "2026-01-05T18:39:55.164Z" },
      { ...card, lastReviewAt: 0 },
      { ...card, difficulty: Number.NaN },
    ]) {
      let error: unknown;
      try {
        scheduler.review({ ...state, card: broken } as SchedulingState, "good", NOW + 1);
      } catch (thrown) {
        error = thrown;
      }
      expect(isLearnError(error, "UNSUPPORTED_SCHEDULING_STATE"), JSON.stringify(broken)).toBe(
        true,
      );
    }
  });

  it("checks its options and times", () => {
    expect(() => createFsrsScheduler({ desiredRetention: 1 })).toThrow(TypeError);
    expect(() => createFsrsScheduler({ weights: [1, 2, 3] })).toThrow(TypeError);
    const scheduler = createFsrsScheduler();
    expect(() => scheduler.initial(0)).toThrow(TypeError);
    expect(() => scheduler.initial(Number.NaN)).toThrow(TypeError);
    expect(() => scheduler.review(scheduler.initial(NOW).state, "perfect" as never, NOW)).toThrow(
      TypeError,
    );
  });

  it("gives a learner aiming for higher retention shorter intervals", () => {
    const relaxed = createFsrsScheduler({ desiredRetention: 0.8 });
    const strict = createFsrsScheduler({ desiredRetention: 0.95 });
    const due = (scheduler: ReturnType<typeof createFsrsScheduler>) =>
      scheduler.review(scheduler.initial(NOW).state, "good", NOW).due;
    expect(due(strict)).toBeLessThan(due(relaxed));
  });
});
