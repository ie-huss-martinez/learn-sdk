# 0004. Dependencies: hand-written validators, FSRS-7 through ts-fsrs, and nothing from ICU

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

Every runtime dependency ends up in every host's bundle and supply chain, so the family requires each to be justified ([ADR 0012](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md)), and third-party engines follow [ADR 0028](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0028-third-party-engines.md). `learn-sdk` needs two capabilities that libraries offer:

- **validation** of content and answers by shape ([ADR 0002](0002-content-as-hostile-input.md));
- **spaced repetition**, scheduling when a learner should see a word again.

It also depends on the runtime for string handling, and grading must give the same result on a server and in every browser.

We measured on 2026-11-12, with esbuild (minified, ESM) and `gzip -9`, and ran code in Node 24.21.0 and, through Playwright, in Chromium 158, Firefox 159 and WebKit 27.2.

**Validators.** The content envelope and three exercise types (multiple choice, gap fill, word order), written four ways with the same rules:

| Implementation | Minified | Gzipped |
|---|---|---|
| Hand-written, with issue codes, own data properties only, unknown fields reported, limits | 3.9 kB | 1.5 kB |
| zod 4, `zod/mini` | 23.6 kB | 7.8 kB |
| zod 3 | 60.8 kB | 14.5 kB |
| zod 4, full API | 454.9 kB | 92.7 kB |

The hand-written version reported a getter as `not-data` without calling it, and a parsed `__proto__` key as `unknown-field`.

**Spaced repetition.** ts-fsrs 6.0.0, published 2026-10-28, MIT, © 2026 Open Spaced Repetition. It depends on `@open-spaced-repetition/srs-kit` 1.0.0, BSD-3-Clause.

- Its classic `fsrs()` API uses FSRS-6's 21 weights by default, and its newer `DefaultScheduler()` uses FSRS-7 by default but bundles every model from FSRS-3 to FSRS-7.
- Sizes, gzipped:

  | Bundle | Gzipped |
  |---|---|
  | A host that uses only the core, with a fake scheduler | 132 B, no ts-fsrs code |
  | Classic `fsrs()` adapter | 10.9 kB |
  | Explicit FSRS-7: `defineScheduler` with `FSRS7Model`, `dateChrono` and the desired-retention policy | 13.6 kB |
  | `DefaultScheduler({ version: "FSRS-7" })` | 16.9 kB |
- None of these bundles contains `eval(`, `new Function` or `fetch(`.
- **Determinism:** the explicit FSRS-7 scheduler, without fuzzing, reviewed a new card five times (Good, Good, Again, Good, Easy) and gave **identical due dates in all four runtimes**, and on repeated runs. One card's state is 189 characters as JSON.

**Strings and ICU.** A grading corpus covered a composed and a decomposed `é`, Thai answers with spaces typed between words, a Thai word typed with its marks in another order, and sara am typed as two characters. It was graded with NFC normalisation and a profile's string rules. It gave **identical results in all four runtimes, with `Intl` present and with it deleted**. NFC unified the two `é`s but not the Thai variants: sara am's two-character form is a compatibility decomposition, and mark order is outside normalisation. Rules like those belong in a language profile.

## Decision

### No schema library

- Validators are hand-written in `learn-sdk`, with one small shared helper. They follow [ADR 0002](0002-content-as-hostile-input.md): expected shape only, own data properties read through `Object.getOwnPropertyDescriptor` (accessors rejected as `not-data`, never called), unknown fields reported, fresh objects built, limits checked as they go.
- They report issue codes, never text; messages come from the catalogue.
- Every built-in type has adversarial tests: a getter, a Proxy, a cycle, `__proto__` and `constructor` keys, wrong types, oversized lists, deep nesting. A property-based fuzz test also runs each type's validator and grader together.

### ts-fsrs, for FSRS-7, behind the `Scheduler` port

- **Model:** FSRS-7, named explicitly through `defineScheduler({ model: FSRS7Model, chrono: dateChrono })` with the desired-retention policy. Not `DefaultScheduler()`, whose default model can change between releases and which bundles models we don't use.
- **Defaults:** `FSRS7_DEFAULT_WEIGHTS` (34 weights), `fractionalDays: true`, desired retention 0.9. Hosts may pass optimised weights and their own retention, which the adapter validates.
- **No fuzzing,** so a review gives the same due date on a server and in a browser.
- **Only `createFsrsScheduler()` imports ts-fsrs,** in `src/adapters/fsrs/`, enforced by a dependency-cruiser rule. Hosts that don't use it don't bundle it: the package keeps `"sideEffects": ["**/*.css"]`.
- **Pinned exactly,** at a version past the family's one-day `minimumReleaseAge`, as a dependency, with srs-kit pinned through the lockfile.
- **`NOTICE`** credits ts-fsrs (MIT) and srs-kit (BSD-3-Clause), with their copyright lines and versions, in the pull request that first bundles them into the standalone script. A build test checks that the versions in `NOTICE` match the lockfile.
- **ADR 0028:** the build test that scans for `eval(` and `new Function` covers the adapter's chunk. The scheduler fetches nothing.
- **Scheduler state is opaque and versioned:** `{ scheduler: "fsrs", model: "FSRS-7", version: 1, card }`. The adapter refuses state with an unknown model or version. Any upgrade that changes the state's shape or meaning ships a migration and its tests in the same pull request. Upgrades go one per pull request, with the contract tests and the cross-runtime determinism test.

### Nothing from ICU

- **Grading uses `String.prototype.normalize("NFC")`, comparisons of code units, and the language profile's own functions.** Never `Intl`, `Intl.Segmenter`, `localeCompare`, `toLocaleLowerCase` or anything else whose result depends on ICU data or the locale.
- **A test runs the grading corpus in plain Node with `Intl` deleted, and in all three browser engines,** and requires identical results.
- **Unicode normalisation** is data every runtime ships. The Unicode stability policy keeps NFC results stable for assigned characters, so it doesn't vary the way segmentation and collation do.

## Alternatives considered

- **zod:** familiar, and `zod/mini` is small. But it's still five times the hand-written size in every host, its messages are English text, against [ADR 0019](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0019-message-catalogues.md), and its error paths would need translating into our issue codes anyway.
- **JSON Schema with a validator such as Ajv:** larger again, and the fast path compiles validators with `new Function`, against [ADR 0028](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0028-third-party-engines.md).
- **Our own FSRS:** the algorithm and its parameters change between model versions, and ts-fsrs is the reference implementation's TypeScript port, maintained by the people who publish FSRS. Re-deriving it would be a correctness risk for a small saving.
- **ts-fsrs's `DefaultScheduler()`:** 3.3 kB larger, and its model changes with ts-fsrs's default.
- **FSRS-6 through the classic API:** 2.7 kB smaller, but FSRS-7 is the current model, and starting there avoids an early state migration.
- **Fuzzed intervals:** they spread reviews out, but break determinism between server and browser. A host that wants fuzzing can wrap the port.

## Consequences

- The core has no third-party runtime code. Hosts that use spaced repetition add about 13.6 kB gzipped.
- We own our validators, and their tests are the larger part of their cost.
- ts-fsrs's releases need watching. The adapter is small, its contract tests pin its behaviour, and its state format lets us migrate or replace it.
- Language rules that NFC doesn't cover, such as Thai sara am and mark order, are each language profile's job, and the profiles' tests must include them.
