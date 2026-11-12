# Working in this repository

This repository is part of the `@hussmartinez` SDK family and is public. Treat it as a showcase: code, commits and pull requests should read as professional work.

It publishes `@hussmartinez/learn-sdk`: a headless core for learning content (exercise types, grading, spaced repetition, course-based access), React components (`LearnPlayer` for learners, `LearnEditor` for teachers) and the `<hm-learn-player>` custom element. The core also runs on servers, so a host can grade on its server with the same code the browser uses. Learners' answers and progress belong to the host application; the SDK makes no requests of its own.

## Before changing anything

- Read [`STANDARDS.md`](https://github.com/ie-huss-martinez/sdk-core/blob/main/STANDARDS.md) in `sdk-core`. It is binding for every repository in the family.
- Check the decision records before changing anything they cover. Family-wide decisions live in [`sdk-core`'s `docs/adr`](https://github.com/ie-huss-martinez/sdk-core/tree/main/docs/adr); decisions specific to this repository live in `docs/adr` here. To change a decision, write a new ADR that supersedes the old one, in the same pull request as the change. A change to a family-wide decision belongs in `sdk-core`, not here.
- The records that matter most here are [0004](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0004-entry-points-and-module-format.md) (entry points), [0007](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0007-server-rendering-and-nextjs.md) (server rendering), [0008](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0008-ports-adapters-and-session.md) and [0017](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0017-core-errors-and-shared-runtime-imports.md) (layers), [0029](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0029-session-store-and-history.md) (store and history), [0010](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0010-edits-as-commands.md) (edits as commands), [0009](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0009-features-as-tools.md) and [0030](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0030-tools-and-keyboard-shortcuts.md) (tools and shortcuts), [0012](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md) and [0020](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0020-file-policy.md) (hostile input and limits), [0034](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0034-shared-error-helpers.md) (error helpers), [0036](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0036-ui-as-a-dependency-of-the-sdks.md) (`ui` as a dependency), [0040](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0040-editor-element-base.md) (element base), and [0014](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0014-accessibility-and-translatable-text.md) and [0019](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0019-message-catalogues.md) (accessibility and text).

## Making changes

- **Pull requests:** work on a branch and open one focused pull request per change. Never push to `main`; it is protected.
- **One pull request at a time:** after opening a pull request, stop and report its link, a short summary and your `pnpm verify` result. Start the next change only once it's merged, from an up-to-date `main`.
- **Never merge your own pull request:** a separate reviewer reads the full diff, runs `pnpm verify` independently for code changes, and squash-merges it. An agent that wrote a pull request never reviews or merges it. See [How pull requests are reviewed](https://github.com/ie-huss-martinez/sdk-core/blob/main/CONTRIBUTING.md#how-pull-requests-are-reviewed).
- **Pull request descriptions:** cover what changed, why, and how it was tested. They can be as detailed as useful, because they don't go into git history.
- **Squash commits:** the merger writes the commit message on `main`. Its title is the pull request title plus `(#N)`, and its body is 2–6 lines of plain prose. See [How pull requests are merged](https://github.com/ie-huss-martinez/sdk-core/blob/main/CONTRIBUTING.md#how-pull-requests-are-merged).
- **Commits:** follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`, `chore:`). The pull request title becomes the squash commit, so write it as a Conventional Commit too.
- **Changesets:** a pull request that changes the published package's source or `package.json` adds a changeset with `pnpm changeset`. Write its note for the package's users: what changed for them, the API they'll see, and how to migrate if it breaks. Versions and changelogs come from changesets, not commits. See [Changesets](https://github.com/ie-huss-martinez/sdk-core/blob/main/CONTRIBUTING.md#changesets).
- **Signing:** commits are signed; don't disable signing.
- **No attribution:** don't add AI or tool attribution to commits or pull requests.
- **ADRs:** add one for any significant decision, meaning anything affecting public API, cross-package consistency, security or learners' data, or that is hard to reverse.
- **Other repositories:** don't edit them from here. If this repository needs a change elsewhere, such as a shared helper in `@hussmartinez/sdk-core` or a component in `@hussmartinez/ui`, propose it in that repository.

## Learn SDK rules

These follow from the standards; they're repeated here because they apply to almost every change in this repository.

- **Layers:** code lives in `src/core` (`model`, `errors`, `operations`, `ports`, `session`), `src/adapters`, `src/features`, `src/react`, `src/element` and `src/messages`. The core never imports React, `@hussmartinez/ui`, an adapter or a feature. `dependency-cruiser` enforces the layer rules.
- **Server-safe core:** the root entry imports and grades in plain Node and in Workers runtimes, with no DOM globals. A test proves it.
- **Content is hostile input:** exercise content written by teachers or imported from files is untrusted. It is size-checked before `JSON.parse`, validated by hand-written validators that report issue codes, and rendered as text only: never as HTML, Markdown or links. Media references are opaque strings that the host resolves. Content size, item counts and string lengths come from `defineLimits` and fail with their own error codes.
- **Grading is deterministic:** grading functions are pure, and give the same result in every runtime. They never depend on `Intl.Segmenter`, ICU data or the locale; answers are compared after NFC normalisation and the language profile's own string rules. Word segmentation is for display only, and payloads that need tiles store them explicitly.
- **No network:** the SDK makes no requests of its own. Audio reaches it as bytes through the host's `AudioSource` port and plays from `blob:` URLs, each revoked when its clip ends or the player unmounts. Speech synthesis is never built in: platform voices may synthesise in the cloud, so it is only ever a host-supplied adapter.
- **Learners' data:** answers, progress and scheduling state belong to the host, through the `ProgressStore` port. Usage events go only to the host's `onEvent`, and never contain answers, content, names or scores tied to a learner. Any adapter that stores data on the device is opt-in, namespaces and versions its keys, and validates what it reads back.
- **Errors:** `LearnError` extends `SdkError`, with stable `SCREAMING_SNAKE_CASE` codes. User-facing text is looked up by code in the message catalogue, never taken from `error.message`; every error and validation issue code has a catalogue message, and a test checks it.
- **Exercise types and tools:** exercise types are content types, registered with `defineExerciseType`, each in its own folder under `src/features/`. Player and editor actions, such as check, next and add exercise, are tools registered with `defineTool`. Every edit in the editor is a serialisable command run by the session, with undo and redo.
- **Accessibility:** every exercise works by keyboard and by tapping. Drag and drop is only ever an enhancement, never the only way to answer.
- **Entry points:** `.` is server-safe, with no React and no DOM access on import; `./react` starts with `"use client"`; `./element` registers nothing on import. Library code never imports CSS.
- **Styles and text:** styles live in the `hm.sdk` layer, with `.hm-learn-*` classes and values from `--hm-*` tokens. Shared controls come from `@hussmartinez/ui`. Every visible string and accessible name comes from `src/messages/en.ts`.
- **No content in the package:** vocabularies, courses, recordings and other learning content belong to host applications, whatever their licence.
- **Third-party code:** every bundled library's licence must be compatible with Apache-2.0, and `NOTICE` credits each one whose licence requires it.

## Verifying changes

- **Hooks:** they run automatically: linting and a secret scan on commit, commit message checks, and `pnpm verify:fast` on push. Never use `--no-verify`. If a hook is wrong or too slow, fix it in its own pull request.
- **Before marking a pull request ready,** run the full `pnpm verify` locally and report its results in the description.
- **CI:** it runs `pnpm verify` on Chromium, Firefox and WebKit, checks the pull request title, and checks for a changeset when the published package changes. All three must pass before merging. CI is the final gate, not a substitute for local verification.
- **Never weaken a check to make it pass.** That includes lint rules, size budgets, the API report, accessibility checks, content limits and the no-network assertion. Fix the cause, or propose the change in its own pull request with an ADR if the rule itself is wrong.
