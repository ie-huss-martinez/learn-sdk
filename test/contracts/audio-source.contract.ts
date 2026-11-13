import { describe, expect, it } from "vitest";
import type { AudioSource } from "../../src/core/ports/audio-source.js";

/**
 * The AudioSource contract (ADR 0001, ADR 0003), run against an adapter
 * created with one clip, "known", holding the bytes 1, 2, 3.
 */
export function audioSourceContract(name: string, create: () => AudioSource): void {
  describe(`${name} meets the AudioSource contract`, () => {
    it("resolves to the clip's bytes", async () => {
      const clip = await create().load("known");
      expect(clip).not.toBeNull();
      const bytes =
        clip instanceof Blob
          ? new Uint8Array(await clip.arrayBuffer())
          : new Uint8Array(clip as ArrayBuffer);
      expect([...bytes]).toEqual([1, 2, 3]);
    });

    it("resolves to null for an unknown reference", async () => {
      expect(await create().load("unknown")).toBeNull();
    });

    it("rejects with ABORTED when the signal has aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(create().load("known", { signal: controller.signal })).rejects.toMatchObject({
        name: "LearnError",
        code: "ABORTED",
      });
    });
  });
}
