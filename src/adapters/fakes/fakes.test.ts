import { describe, expect, it } from "vitest";
import { audioSourceContract } from "../../../test/contracts/audio-source.contract.js";
import { schedulerContract } from "../../../test/contracts/scheduler.contract.js";
import { createFakeAudioSource } from "./fake-audio-source.js";
import { createFakeScheduler } from "./fake-scheduler.js";

audioSourceContract("createFakeAudioSource", () =>
  createFakeAudioSource({ known: new Uint8Array([1, 2, 3]) }),
);
schedulerContract("createFakeScheduler", createFakeScheduler);

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
