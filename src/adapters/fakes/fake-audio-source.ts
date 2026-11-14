import { throwIfAborted } from "../../core/errors/error-helpers.js";
import type { AudioSource } from "../../core/ports/audio-source.js";

/**
 * An `AudioSource` (from `@hussmartinez/learn-sdk`) for tests: serves the clips it was given, by
 * reference, and `null` for any other reference. It never touches the
 * network.
 *
 * @example
 * ```ts
 * const audio = createFakeAudioSource({ "hello.mp3": new Uint8Array([1, 2, 3]) });
 * ```
 *
 * @param clips - Clips by reference.
 * @public
 */
export function createFakeAudioSource(
  clips: Readonly<Record<string, Uint8Array | Blob>>,
): AudioSource {
  const byRef = new Map(Object.entries(clips));
  return {
    async load(ref, options = {}) {
      throwIfAborted(options.signal);
      const clip = byRef.get(ref);
      if (clip === undefined) {
        return null;
      }
      return clip instanceof Blob ? clip : new Blob([new Uint8Array(clip)]);
    },
  };
}
