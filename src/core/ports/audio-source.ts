import type { LearnCallOptions } from "./options.js";

/**
 * Where audio comes from: the host's own storage, cache or speech service
 * (ADR 0001, ADR 0003). The SDK never fetches audio itself. Content names a
 * clip with an opaque reference, and the host turns it into bytes.
 *
 * Contract, checked by the SDK's contract tests for every adapter:
 * - `load` resolves to the clip's bytes, or `null` when there's no clip for
 *   the reference;
 * - it rejects with `ABORTED` when `signal` aborts before it settles;
 * - it never resolves to anything else.
 *
 * Speech synthesis is never built in. A host may synthesise in its adapter,
 * and is then responsible for where the text goes (ADR 0003).
 *
 * @example
 * ```ts
 * const audio: AudioSource = {
 *   async load(ref, { signal } = {}) {
 *     const response = await fetch(`/audio/${encodeURIComponent(ref)}.mp3`, { signal });
 *     return response.ok ? response.blob() : null;
 *   },
 * };
 * ```
 *
 * @public
 */
export interface AudioSource {
  load(ref: string, options?: LearnCallOptions): Promise<Blob | ArrayBuffer | null>;
}
