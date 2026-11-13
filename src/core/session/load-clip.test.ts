import { describe, expect, it } from "vitest";
import { isLearnError } from "../errors/learn-error.js";
import type { AudioSource } from "../ports/audio-source.js";
import { loadClip } from "./load-clip.js";

/** A minimal in-test source; adapters aren't imported by the core's tests (layer rules). */
const sourceOf = (clips: Record<string, Uint8Array>): AudioSource => ({
  async load(ref, options = {}) {
    if (options.signal?.aborted) {
      throw options.signal.reason;
    }
    const clip = clips[ref];
    return clip === undefined ? null : new Blob([new Uint8Array(clip)]);
  },
});

async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (isLearnError(error)) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a LearnError");
}

describe("loadClip", () => {
  it("returns the clip as a Blob, from bytes or a Blob", async () => {
    const audio = sourceOf({ a: new Uint8Array([1, 2, 3]) });
    expect((await loadClip(audio, "a")).size).toBe(3);
    const fromBuffer: AudioSource = { load: async () => new Uint8Array([4, 5]).buffer };
    expect((await loadClip(fromBuffer, "b")).size).toBe(2);
  });

  it("reports a missing clip, a failing source and a wrong result as AUDIO_UNAVAILABLE, naming no reference", async () => {
    const empty = await failure(() => loadClip(sourceOf({}), "secret-ref"));
    expect(empty.code).toBe("AUDIO_UNAVAILABLE");
    expect(JSON.stringify(empty.details ?? {})).not.toContain("secret-ref");
    const failing: AudioSource = {
      load: async () => {
        throw new TypeError("network down");
      },
    };
    const failed = await failure(() => loadClip(failing, "x"));
    expect(failed.code).toBe("AUDIO_UNAVAILABLE");
    expect(failed.cause).toBeDefined();
    const wrong = { load: async () => "not bytes" } as unknown as AudioSource;
    expect((await failure(() => loadClip(wrong, "x"))).code).toBe("AUDIO_UNAVAILABLE");
  });

  it("checks the clip's size against maxFileSize, and the reference's length", async () => {
    const big = sourceOf({ big: new Uint8Array(2_000) });
    expect(
      (await failure(() => loadClip(big, "big", { limits: { maxFileSize: 1_000 } }))).code,
    ).toBe("FILE_TOO_LARGE");
    expect((await failure(() => loadClip(big, "x".repeat(2_001)))).code).toBe("TEXT_TOO_LONG");
  });

  it("rejects with ABORTED, before or during loading", async () => {
    const controller = new AbortController();
    controller.abort();
    const audio = sourceOf({ a: new Uint8Array([1]) });
    expect((await failure(() => loadClip(audio, "a", { signal: controller.signal }))).code).toBe(
      "ABORTED",
    );
    const slow = new AbortController();
    const hanging: AudioSource = {
      load: (_ref, options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener("abort", () => reject(new Error("stopped"))),
        ),
    };
    const pending = failure(() => loadClip(hanging, "a", { signal: slow.signal }));
    slow.abort();
    expect((await pending).code).toBe("ABORTED");
  });
});
