---
"@hussmartinez/learn-sdk": patch
---

Importing a single piece from `@hussmartinez/learn-sdk/react`, such as `playerCatalogue`, `definePlayerBlock` or one exercise block, no longer brings `LearnPlayer`'s internals into your bundle. With esbuild it saved about 1.5 kB per such import. Nothing changes in the API or in behaviour.
