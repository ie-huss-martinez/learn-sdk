---
"@hussmartinez/learn-sdk": minor
---

First release of `@hussmartinez/learn-sdk`, a learning SDK: exercise types with grading that gives the same result in the browser and on a server, spaced repetition, a player for learners and an editor for teachers. Learners' answers and progress stay with the host application; the SDK makes no network requests of its own.

- **Package shape:** an ES module package with a server-safe headless core (`@hussmartinez/learn-sdk`), a React entry (`@hussmartinez/learn-sdk/react`), a custom element entry (`@hussmartinez/learn-sdk/element`) and one stylesheet (`@hussmartinez/learn-sdk/styles.css`), which applications import once. React and React DOM 18.3 or later are optional peer dependencies.
