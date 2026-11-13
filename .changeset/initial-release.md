---
"@hussmartinez/learn-sdk": minor
---

First release of `@hussmartinez/learn-sdk`, a learning SDK: exercise types with grading that gives the same result in the browser and on a server, spaced repetition, a player for learners and an editor for teachers. Learners' answers and progress stay with the host application; the SDK makes no network requests of its own.

- **Package shape:** an ES module package with a server-safe headless core (`@hussmartinez/learn-sdk`), a React entry (`@hussmartinez/learn-sdk/react`), a custom element entry (`@hussmartinez/learn-sdk/element`) and one stylesheet (`@hussmartinez/learn-sdk/styles.css`), which applications import once. React and React DOM 18.3 or later are optional peer dependencies.
- **Errors:** every failure is a `LearnError` with a stable `code`, such as `INVALID_CONTENT`, `UNSUPPORTED_CONTENT_VERSION`, `INVALID_ANSWER` or `AUDIO_UNAVAILABLE`, and structured `details` that never contain a learner's answer. `isLearnError(error, code)` checks one, including errors a server sent to the browser.
- **Limits for untrusted content:** `learnLimits` adds `maxContentSize`, `maxExercises`, `maxItems`, `maxChoices`, `maxTiles` and `maxTextLength` to the family's limits, and uses `maxFileSize` for audio clips, with defaults sized for real courses: 2 MB of content, 500 exercises and 5 MB clips. Set them with the `limits` setting; a misspelt limit name throws instead of being ignored.
- **Validation issues:** content and answers that fail validation report `LearnIssue`s, each with a path to the field and a stable `code`, such as `required`, `unknown-field` or `too-few`.
- **Translatable text:** `learnMessages` is the English catalogue for every error code, limit warning and validation issue, for `createMessages` from `@hussmartinez/sdk-core`. Error text comes from the code and its details, never from the error's message.
