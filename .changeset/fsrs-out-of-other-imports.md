---
"@hussmartinez/learn-sdk": patch
---

Importing from `@hussmartinez/learn-sdk` no longer brings ts-fsrs into your bundle unless you use `createFsrsScheduler`. Bundlers such as esbuild used to keep about 3 kB of ts-fsrs for any import from the root entry, even `LearnError` or `createLearnPlayer`. Nothing changes in the API or in how scheduling behaves.
