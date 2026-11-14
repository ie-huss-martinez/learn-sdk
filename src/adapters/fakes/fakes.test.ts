import { describe, expect, it } from "vitest";
import { defineAudioSourceContract } from "../../testing/audio-source-contract.js";
import { defineSchedulerContract } from "../../testing/scheduler-contract.js";
import { createFakeAudioSource } from "./fake-audio-source.js";
import { createFakeScheduler } from "./fake-scheduler.js";

defineAudioSourceContract(
  "createFakeAudioSource",
  () => createFakeAudioSource({ known: new Uint8Array([1, 2, 3]) }),
  {
    describe,
    it,
  },
);
defineSchedulerContract("createFakeScheduler", createFakeScheduler, { describe, it });

describe("createFakeScheduler", () => {
  it("doubles intervals with each review, and starts again after 'again'", () => {
    const scheduler = createFakeScheduler();
    const day = 24 * 60 * 60 * 1000;
    let { state } = scheduler.initial(0);
    const first = scheduler.review(state, "good", 0);
    expect(first.due).toBe(3 * day);
    const second = scheduler.review(first.state, "good", first.due);
    expect(second.due - first.due).toBe(6 * day);
    ({ state } = scheduler.review(second.state, "again", second.due));
    expect(scheduler.review(state, "good", 0).due).toBe(3 * day);
  });
});
