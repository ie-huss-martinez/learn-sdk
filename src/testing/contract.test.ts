import { describe, expect, it } from "vitest";
import { createFakeAudioSource } from "../adapters/fakes/fake-audio-source.js";
import { createFakeScheduler } from "../adapters/fakes/fake-scheduler.js";
import { createMemoryProgressStore } from "../adapters/memory-progress/memory-progress.js";
import type { ProgressSnapshot } from "../core/model/progress.js";
import type { AudioSource } from "../core/ports/audio-source.js";
import type { ProgressStore } from "../core/ports/progress-store.js";
import type { Scheduler } from "../core/ports/scheduler.js";
import { defineAudioSourceContract } from "./audio-source-contract.js";
import type { ContractTestApi } from "./contract.js";
import { sameData } from "./contract.js";
import { defineProgressStoreContract } from "./progress-store-contract.js";
import { defineSchedulerContract } from "./scheduler-contract.js";

/** Runs a suite with a recording test API, and returns each test's failure message, or "pass". */
async function results(register: (api: ContractTestApi) => void): Promise<Record<string, string>> {
  const tests: [string, () => Promise<void>][] = [];
  register({
    describe: (_name, body) => body(),
    it: (name, body) => void tests.push([name, body]),
  });
  const outcome: Record<string, string> = {};
  for (const [name, body] of tests) {
    try {
      await body();
      outcome[name] = "pass";
    } catch (error) {
      outcome[name] = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  }
  return outcome;
}

describe("the contract suites", () => {
  it("pass the SDK's own adapters", async () => {
    const all = {
      ...(await results((api) =>
        defineProgressStoreContract("memory", createMemoryProgressStore, api),
      )),
      ...(await results((api) =>
        defineAudioSourceContract(
          "fake",
          () => createFakeAudioSource({ known: new Uint8Array([1, 2, 3]) }),
          api,
        ),
      )),
      ...(await results((api) => defineSchedulerContract("fake", createFakeScheduler, api))),
    };
    expect(
      Object.values(all).every((result) => result === "pass"),
      JSON.stringify(all),
    ).toBe(true);
  });

  it("catch a store that hands out live snapshots", async () => {
    const live = (): ProgressStore => {
      const inner = createMemoryProgressStore();
      let held: ProgressSnapshot | undefined;
      return {
        ...inner,
        async load(scope, options) {
          held ??= await inner.load(scope, options);
          return held;
        },
      };
    };
    const outcome = await results((api) => defineProgressStoreContract("live", live, api));
    expect(outcome["returns copies: changing a snapshot never changes the store"]).toMatch(
      /^ContractViolation: /,
    );
  });

  it("catch a source that ignores abort, and one that returns text", async () => {
    const deaf: AudioSource = {
      load: async (ref) => (ref === "known" ? new Uint8Array([1, 2, 3]).buffer : null),
    };
    const deafOutcome = await results((api) => defineAudioSourceContract("deaf", () => deaf, api));
    expect(deafOutcome["rejects with ABORTED when the signal has aborted"]).toMatch(
      /must reject with a LearnError "ABORTED"/,
    );
    const textual = { load: async () => "1,2,3" } as unknown as AudioSource;
    const textOutcome = await results((api) =>
      defineAudioSourceContract("text", () => textual, api),
    );
    expect(textOutcome["resolves to the clip's bytes"]).toMatch(/Blob or an ArrayBuffer/);
  });

  it("catch a scheduler that accepts foreign states, or isn't deterministic", async () => {
    const lenient = (): Scheduler => {
      const inner = createFakeScheduler();
      return {
        ...inner,
        review: (state, rating, now) =>
          inner.review(
            { ...state, scheduler: "fake", model: "doubling", version: 1, card: { reviews: 0 } },
            rating,
            now,
          ),
      };
    };
    const lenientOutcome = await results((api) => defineSchedulerContract("lenient", lenient, api));
    expect(lenientOutcome["refuses a state from another scheduler, model or version"]).toMatch(
      /UNSUPPORTED_SCHEDULING_STATE/,
    );
    let calls = 0;
    const random = (): Scheduler => {
      const inner = createFakeScheduler();
      return {
        ...inner,
        review: (state, rating, now) => ({
          ...inner.review(state, rating, now),
          due: now + ++calls,
        }),
      };
    };
    const randomOutcome = await results((api) => defineSchedulerContract("random", random, api));
    expect(randomOutcome["is deterministic, and never schedules before now"]).toMatch(
      /same result/,
    );
  });
});

describe("sameData", () => {
  it("compares plain data deeply, ignoring key order", () => {
    expect(sameData({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameData({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameData([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameData(Number.NaN, Number.NaN)).toBe(true);
  });
});
