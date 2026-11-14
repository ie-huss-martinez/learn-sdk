import type { AudioSource } from "../core/ports/audio-source.js";
import { abortedSignal, type ContractTestApi, check, rejectsWith } from "./contract.js";

/**
 * Registers the `AudioSource` (from `@hussmartinez/learn-sdk`) contract's tests for an adapter (ADR
 * 0001, ADR 0003). `make` builds a source holding one clip, under the
 * reference `"known"`, whose bytes are 1, 2, 3, and nothing under any other
 * reference.
 *
 * @param name - The adapter's name, for the test titles.
 * @param make - Builds the source.
 * @param test - The test framework's `describe` and `it`.
 * @public
 */
export function defineAudioSourceContract(
  name: string,
  make: () => AudioSource | Promise<AudioSource>,
  test: ContractTestApi,
): void {
  test.describe(`${name} meets the AudioSource contract`, () => {
    test.it("resolves to the clip's bytes", async () => {
      const clip = await (await make()).load("known");
      check(
        clip instanceof Blob || clip instanceof ArrayBuffer,
        "load must resolve to a Blob or an ArrayBuffer.",
      );
      const bytes = new Uint8Array(clip instanceof Blob ? await clip.arrayBuffer() : clip);
      check(
        [...bytes].join() === "1,2,3",
        `the clip must hold the bytes 1, 2, 3, not ${[...bytes].slice(0, 8).join(", ")}.`,
      );
    });

    test.it("resolves to null for an unknown reference", async () => {
      check(
        (await (await make()).load("unknown")) === null,
        "an unknown reference must resolve to null.",
      );
    });

    test.it("rejects with ABORTED when the signal has aborted", async () => {
      const source = await make();
      await rejectsWith(
        () => source.load("known", { signal: abortedSignal() }),
        "ABORTED",
        "load with an aborted signal",
      );
    });
  });
}
