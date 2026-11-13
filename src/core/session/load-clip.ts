import { abortError, asLearnError, throwIfAborted } from "../errors/error-helpers.js";
import { isLearnError, LearnError } from "../errors/learn-error.js";
import { type LearnLimitOverrides, learnLimits } from "../errors/learn-limits.js";
import type { AudioSource } from "../ports/audio-source.js";
import type { LearnCallOptions } from "../ports/options.js";

/**
 * Options for {@link loadClip}.
 *
 * @public
 */
export interface LoadClipOptions extends LearnCallOptions {
  /** The host's limit settings; `maxFileSize` bounds the clip. */
  readonly limits?: LearnLimitOverrides;
}

/**
 * Loads one clip through the host's {@link AudioSource} and checks it
 * before anything plays it (ADR 0003): its size against `maxFileSize`, and
 * that the source returned bytes at all.
 *
 * @param source - The host's audio source.
 * @param ref - The clip's reference from the content.
 * @param options - Limits and a signal.
 * @returns The clip as a `Blob`.
 * @throws `LearnError`: `AUDIO_UNAVAILABLE` when the source returns nothing
 *   or fails, with the failure as `cause` and no reference in `details`;
 *   `FILE_TOO_LARGE` over `maxFileSize`; `TEXT_TOO_LONG` for a reference
 *   over `maxTextLength`; `ABORTED` or `TIMEOUT` when `signal` aborts.
 * @public
 */
export async function loadClip(
  source: AudioSource,
  ref: string,
  options: LoadClipOptions = {},
): Promise<Blob> {
  const policy = learnLimits.resolve(options.limits);
  policy.check("maxTextLength", ref.length);
  const { signal } = options;
  throwIfAborted(signal);
  let bytes: Blob | ArrayBuffer | null;
  try {
    bytes = await source.load(ref, signal ? { signal } : {});
  } catch (error) {
    if (signal?.aborted) {
      throw abortError(signal);
    }
    if (isLearnError(error) && (error.code === "ABORTED" || error.code === "TIMEOUT")) {
      throw error;
    }
    throw new LearnError("AUDIO_UNAVAILABLE", "The audio source failed.", {
      cause: asLearnError(error),
    });
  }
  throwIfAborted(signal);
  if (bytes === null) {
    throw new LearnError("AUDIO_UNAVAILABLE", "The audio source has no clip for this reference.");
  }
  const blob =
    bytes instanceof Blob ? bytes : bytes instanceof ArrayBuffer ? new Blob([bytes]) : undefined;
  if (!blob) {
    throw new LearnError(
      "AUDIO_UNAVAILABLE",
      "The audio source returned something other than bytes.",
    );
  }
  policy.check("maxFileSize", blob.size);
  return blob;
}
