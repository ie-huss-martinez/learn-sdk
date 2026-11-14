import type { Rating, SchedulingState } from "../core/model/scheduling.js";
import type { Scheduler } from "../core/ports/scheduler.js";
import { type ContractTestApi, check, sameData, throwsWith } from "./contract.js";

const NOW = 1_767_225_600_000; // 2026-01-01
const DAY = 24 * 60 * 60 * 1000;
const RATINGS: readonly Rating[] = ["again", "hard", "good", "easy"];

/**
 * Registers the `Scheduler` (from `@hussmartinez/learn-sdk`) contract's tests for an adapter (ADR 0001,
 * ADR 0004).
 *
 * @param name - The adapter's name, for the test titles.
 * @param make - Builds the scheduler.
 * @param test - The test framework's `describe` and `it`.
 * @public
 */
export function defineSchedulerContract(
  name: string,
  make: () => Scheduler,
  test: ContractTestApi,
): void {
  test.describe(`${name} meets the Scheduler contract`, () => {
    test.it("labels its states with its id, a model and a version", async () => {
      const scheduler = make();
      const { state } = scheduler.initial(NOW);
      check(state.scheduler === scheduler.id, "states must carry the scheduler's id.");
      check(typeof state.model === "string" && state.model !== "", "states must name a model.");
      check(Number.isInteger(state.version), "states must carry an integer version.");
    });

    test.it("is deterministic, and never schedules before now", async () => {
      const scheduler = make();
      let { state } = scheduler.initial(NOW);
      let now = NOW;
      for (const rating of ["good", "good", "again", "hard", "easy", "good"] as const) {
        const first = scheduler.review(state, rating, now);
        check(
          sameData(make().review(state, rating, now), first),
          `reviewing "${rating}" twice must give the same result.`,
        );
        check(first.due >= now, `"${rating}" was scheduled before now.`);
        ({ state } = first);
        now = first.due;
      }
    });

    test.it("never gives a better rating an earlier due time", async () => {
      const scheduler = make();
      const { state } = scheduler.review(scheduler.initial(NOW).state, "good", NOW);
      const dues = RATINGS.map((rating) => scheduler.review(state, rating, NOW + 3 * DAY).due);
      check(
        dues.every((due, index) => index === 0 || due >= (dues[index - 1] as number)),
        `due times must not decrease from "again" to "easy": ${dues.join(", ")}.`,
      );
    });

    test.it("keeps its meaning through JSON, as stored states do", async () => {
      const scheduler = make();
      const { state } = scheduler.review(scheduler.initial(NOW).state, "good", NOW);
      const stored = JSON.parse(JSON.stringify(state)) as SchedulingState;
      check(
        sameData(
          scheduler.review(stored, "good", NOW + 1000),
          scheduler.review(state, "good", NOW + 1000),
        ),
        "a state must review the same after a JSON round trip.",
      );
    });

    test.it("refuses a state from another scheduler, model or version", async () => {
      const scheduler = make();
      const { state } = scheduler.initial(NOW);
      for (const [what, foreign, reason] of [
        [
          "another scheduler",
          { ...state, scheduler: `${state.scheduler}-other` },
          "unknown-scheduler",
        ],
        ["another model", { ...state, model: `${state.model}-other` }, "unknown-scheduler"],
        ["another version", { ...state, version: state.version + 1 }, "unknown-scheduler"],
        ["no card", { ...state, card: null }, "malformed-state"],
      ] as const) {
        throwsWith(
          () => scheduler.review(foreign, "good", NOW),
          "UNSUPPORTED_SCHEDULING_STATE",
          `a state with ${what}`,
          reason,
        );
      }
    });
  });
}
