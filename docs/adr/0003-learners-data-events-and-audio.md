# 0003. Learners' data stays with the host; audio arrives as bytes; no speech synthesis

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

A learning SDK handles data about people: what a learner answered, how they scored, which words they keep forgetting. Learners are often children or students in a school, and the data belongs to them and to the application that serves them, which knows who they are and what the law requires of it. The SDK never knows who the learner is, and it shouldn't need to.

Audio is the SDK's other contact with the outside world. Listening exercises, dialogues and flashcards play recordings that the host owns, stored wherever the host keeps them. The family's rule is that an SDK makes no network requests of its own ([ADR 0012](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md)); an `<audio src>` pointing at a URL would be one.

Text-to-speech looks like a convenient default for audio, but the Web Speech API doesn't promise to stay on the device: a voice whose `localService` is `false` synthesises remotely, so the text, which may be a learner's typed answer, leaves the device for a third party. Which voices are remote depends on the browser and platform, outside the SDK's control.

We measured the audio path on 2026-11-12 in Chromium 158, Firefox 159 and WebKit 27.2, through Playwright, with a generated half-second 440 Hz WAV played from a `blob:` URL:

| Case | Chromium | Firefox | WebKit |
|---|---|---|---|
| No CSP, URL revoked when playback ends | plays to the end | plays to the end | plays to the end |
| No CSP, URL revoked once `play()` resolves | plays to the end | plays to the end | plays to the end |
| No CSP, URL revoked right after setting `src` | media error 4 | `play()` rejected | media error 4 |
| CSP `media-src 'self'` | media error 4 | `play()` rejected | `play()` rejected |
| CSP `media-src 'self' blob:` | plays to the end | plays to the end | plays to the end |

Each engine accepted about 5 million characters in `localStorage` for one origin. One word's spaced-repetition state measured 189 characters as JSON (ADR 0004), so 6,000 words need about 1.1 million.

## Decision

### Learners' data belongs to the host

- **The SDK holds learner state only in memory,** in the player session, for as long as the player is mounted.
- **It hands every change to the host:** through `onProgress`, or the host's `ProgressStore` port ([ADR 0001](0001-package-shape-props-and-ports.md)). A change is one of:
  - an **attempt:** `{ kind: "attempt", exerciseId, answer, grade, at }`, with the answer so the host can grade it again on its server;
  - a **review:** `{ kind: "review", itemId, rating, scheduling, at }`, where `scheduling` is the scheduler's state, opaque and versioned (ADR 0004).

  Changes carry no learner identity. The host knows who is signed in, and scopes what it stores.
- **Grading on a server** receives an answer and content, returns a grade, and keeps nothing.

### What never leaves through events, errors or logs

- **Usage events** (`onEvent`) carry only names and counts: the event, the exercise type, and numbers such as how many items an exercise has. Never answers, content text, exercise or item ids, scores, ratings or anything a host could tie to a learner's performance.
- **Error details** carry paths, codes, limit names and numbers. Never content text or answers. Messages come from the catalogue by code ([ADR 0019](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0019-message-catalogues.md)).
- **The SDK logs nothing.** `noConsole` is on in the family's Biome preset.
- **Tests** check every event and every error code's details for answers and content text, using marker strings.

### Device storage is opt-in

- **The default `ProgressStore` keeps data in memory.** Nothing touches the device unless the host asks.
- **`createLocalProgressStore({ namespace })`** stores progress in `localStorage`, only when a host creates it:
  - **namespaced and versioned keys:** `hm-learn:v1:<namespace>`. The host chooses the namespace, such as per learner, so learners sharing a tablet don't see each other's progress;
  - **validated when read back,** as untrusted input under the same rules as content ([ADR 0002](0002-content-as-hostile-input.md)): size-checked, parsed, validated by shape, and dropped with a warning event if invalid, never trusted;
  - **`clear()`** removes the namespace's data, for signing out on a shared device;
  - **documented as unencrypted:** anyone with access to the browser profile can read it. Hosts that need more use their own store.

### Audio arrives as bytes

- **`AudioSource.load(ref, { signal })`** returns a `Blob`, an `ArrayBuffer` or `null` for a content's opaque audio reference. The host fetches, caches, synthesises or reads from disk; the SDK never fetches.
- **Before playing,** the clip's size is checked against `maxFileSize` (5 MB by default, [ADR 0002](0002-content-as-hostile-input.md)), and `FILE_TOO_LARGE` stops it.
- **One `blob:` URL per clip being played,** created when it's played and revoked when the clip is replaced, its exercise changes, the player unmounts, or playback fails. Never right after creation: that breaks playback in every engine we measured. Replaying the same clip reuses its URL.
- **Tests** count `URL.createObjectURL` and `URL.revokeObjectURL` calls through exercises, replays, errors and unmounts, and fail if any URL is left alive.
- **The README documents the CSP:** hosts need `media-src blob:` (with `'self'` or whatever else they serve), because without it audio fails in every engine.

### No speech synthesis

- **The SDK never calls `speechSynthesis`**, and ships no adapter for it.
- **A host may synthesise** by supplying an `AudioSource` that turns text into bytes, on its server or on the device, and is then responsible for where that text goes. The README explains why the SDK doesn't, including the `localService` caveat.

## Alternatives considered

- **Storing progress on the device by default:** convenient for a demo, but learners on shared school tablets would see each other's data, and hosts would store personal data without deciding to.
- **Including learner ids in progress changes:** the SDK would then need to be told who the learner is and would carry it around. The host already knows.
- **Scores in usage events:** useful for analytics, but scores tied to a session are learners' data; hosts that want them have `onProgress`.
- **Audio by URL:** the SDK would make requests, and hosts couldn't authorise, cache or keep audio private in their own way.
- **Built-in speech synthesis as a fallback:** learners' text could go to a cloud voice without the host knowing.

## Consequences

- Hosts decide what is stored, where, for how long and for whom; the SDK can't leak what it never holds.
- Every host with audio writes an `AudioSource` adapter and adds `media-src blob:` to its CSP.
- Analytics through `onEvent` are coarse by design.
- The device-storage adapter is a convenience for single-learner apps, not a secure store.
