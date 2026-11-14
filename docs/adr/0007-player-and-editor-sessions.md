# 0007. The player and editor sessions: what a learner's check records, and edits as a portable command format

- **Status:** Accepted; refines the sessions section of [0001](0001-package-shape-props-and-ports.md)
- **Date:** 2026-11-14

## Context

[ADR 0001](0001-package-shape-props-and-ports.md) settles the shape: the player session is a store of the current attempt, with commands through a `Reducer`, and the editor session is a store with history, where every edit is a serialisable command ([sdk-core ADR 0029](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0029-session-store-and-history.md), [ADR 0010](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0010-edits-as-commands.md)). Before either is built, several things need deciding:

- **What a check records,** and when it reaches the host's `ProgressStore`, which is asynchronous and may fail.
- **Whether quiz answers feed spaced repetition.** The `Scheduler` port and FSRS-7 exist ([ADR 0004](0004-dependencies-validators-and-fsrs.md)), but a wrong quiz answer isn't the same signal as a learner rating how well they recalled a card.
- **Which edits exist as commands.** Commands are serialisable, so hosts may store or sync them, and then they're a format of their own, needing a schema and conformance vectors ([sdk-core ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md), [ADR 0006](0006-portable-formats.md)).
- **How the editor reports problems** while a teacher is halfway through writing an exercise, which is invalid content by definition.

Both sessions are headless and live in the root entry, so they're server-safe and testable without a DOM. The React components and the element wrap them later.

## Decision

### The player session

`createLearnPlayer({ content, types, profile, progressStore, scope, scheduler, limits, now, onProgress, onEvent, onError })` returns a store whose snapshot `useSyncExternalStore` can read, with the actions below.

- **Content is read with `parseContent`,** so a host can't hand the player unvalidated content ([ADR 0002](0002-content-as-hostile-input.md)). The player never changes it.
- **The snapshot** holds:
  - the current exercise's position;
  - for each exercise, its status (`answering`, `checked` or `skipped`), the learner's draft answer and, once checked, its grade;
  - `complete`, with a summary of score, max and how many were skipped, once every exercise is checked or skipped;
  - the save state: `idle`, `saving` or `failed`.
- **Actions** go through the player's reducer:
  - `answer(answer)` replaces the current draft;
  - `check()` grades it;
  - `next()` and `previous()` move;
  - `retry()` returns a checked exercise to `answering`, with an empty draft;
  - `skip()` marks it skipped.
- **The player has no undo.** A check is a record of what the learner did, and `retry()` is how they try again. These commands are the player's own, internal and not a portable format; only the editor's are ([below](#the-editor-session)).
- **`check()` grades with `gradeAnswer`,** the same function a server uses. A draft that doesn't fit its exercise is a bug in the component that built it, not something the learner did, so `check()` throws `INVALID_ANSWER` and changes nothing. Drafts may be partial: a skipped question or an empty gap is a valid answer, graded wrong.
- **Each check records one `attempt` change:** the exercise's id, the answer, its grade and the time from `now` (by default `Date.now`, injectable for tests). Retrying and checking again records another attempt; earlier ones stay. Skipping records nothing.
- **Recording never waits on storage.** The grade shows as soon as the check is made. Each change goes to `onProgress` at once, and to `progressStore.save(scope, changes)` in order:
  - while a save is running, later changes queue behind it;
  - a failed save sets the save state to `failed` and reports `STORAGE_UNAVAILABLE` to `onError`;
  - the failed changes stay queued, ahead of any new ones, and go again with the next save or `retrySave()`;
  - the learner's grade is never lost from the session because storage failed.
- **Skips stay in the session.** A skipped exercise counts as neither right nor wrong, and the summary reports it separately, so the listening type's "I can't listen now" never costs a learner points. `hm-learn-progress` v1 has no skipped record; keeping skips across sessions would need a new version, decided with the listening type if it's wanted.
- **Usage events** (`onEvent`) carry only names and counts, as [ADR 0003](0003-learners-data-events-and-audio.md) requires: an exercise checked, with its type and item count; the player complete, with the number of exercises. Never scores, answers or ids.

### Spaced repetition: attempts only, unless a type rates items

- **The player records attempts, and nothing else, by default.** No built-in quiz type turns a grade into a scheduler rating.
- **An `ExerciseType` may define `reviewItems(payload, answer, grade)`,** returning the items it reviewed, each `{ itemId, rating }`. It's optional, and meant for types whose items the learner rates themselves, such as flashcards, where the answer holds the learner's own `again`, `hard`, `good` or `easy`.
- **When a type defines it and the host gives a `scheduler`,** checking also reviews each item: from its card in the scope's progress, loaded when the player starts, or from `scheduler.initial(now)` for a new item. Each review is a `review` change, recorded and saved with the attempt.
- **A host may opt a quiz type in** by defining its own type with `reviewItems`, for example `defineExerciseType({ ...multipleChoice, reviewItems })`, which decides how its grades map to ratings. learn-sdk ships no such mapping, so a quiz never becomes a scheduling signal unless a host decides it should.

### The editor session

`createLearnEditor({ initialContent, types, limits, newId, onChange, onEvent })` returns a store with history.

- **It opens valid content only:** `initialContent` is read with `parseContent`, or the editor starts from an empty `hm-learn-content` document. Repairing invalid content isn't the editor's job yet.
- **While editing, the document is a draft** that may be invalid: a new exercise has an empty prompt until the teacher writes one. The snapshot holds the draft, its `issues` (each `LearnIssue` with its path, from the same validators `parseContent` uses, run after every edit), `canUndo`, `canRedo` and `trimmed`.
- **`onChange(draft, { issues })`** is called after every edit and every undo or redo, so a host can keep drafts. **`getContent()`** returns the draft as validated `hm-learn-content`, through `parseContent`, or throws `INVALID_DOCUMENT` with every issue. Publishing goes through it, so invalid content is never published by mistake.
- **Exercise ids are fixed once created.** Progress refers to exercises by id ([ADR 0003](0003-learners-data-events-and-audio.md)), so renaming one would cut it off from learners' attempts. New exercises take their id from `newId()`, which the host may supply, and which defaults to a random UUID.
- **History** is sdk-core's `createHistory`, with `group()` for gestures that make several commands. A burst of typing in one field is one step, ending when the field loses focus or after a pause. The history keeps at most 500 steps, dropping them in `dropOrder` and setting `trimmed`, so the editor can say that the earliest edits can't be undone.
- **Destructive edits run at once and offer undo,** with no confirmation ([ADR 0010](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0010-edits-as-commands.md)): removing an exercise is one undo away.

### Edits as a format: `hm-learn-commands` v1

Every edit is one of five commands, a JSON object with a `type`:

| Command | Fields | Its inverse |
|---|---|---|
| `learn.addExercise` | `exercise` (`{ id, type, title?, instructions?, payload }`), `at` | `learn.removeExercise` |
| `learn.removeExercise` | `exerciseId` | `learn.addExercise`, with the exercise as it was, where it was |
| `learn.moveExercise` | `exerciseId`, `to` | `learn.moveExercise` back |
| `learn.setExerciseText` | `exerciseId`, `field` (`title` or `instructions`), `value` (text, or `null` to remove it) | `learn.setExerciseText` with the old value |
| `learn.setPayload` | `exerciseId`, `payload` | `learn.setPayload` with the old payload |

- **Payloads are replaced whole.** An exercise type's editor block builds the new payload, so types never add commands of their own, and the format stays the same as types are added.
- **The schema** is `formats/hm-learn-commands/v1.schema.json`, shipped like the others. Its record is in `docs/formats/`, and `conformance/hm-learn-commands.json` holds vectors. Their input is `{ document, command }`, and their result is the draft after the command; the command's inverse must restore the document exactly.
- **Commands are untrusted:** they may come from storage or another device. The reducer copies each with `structuredClone`, checks its shape, and checks every text in it against `maxTextLength` in code points, including texts inside a payload. Ids are values, compared in lists and never used as object keys, so ids such as `__proto__`, `constructor` and `toString` are ordinary ids. Vectors include them.
- **The reducer doesn't correct a command.** Out-of-range positions and unknown ids are refused, not clamped; the UI clamps what people enter before it builds a command.

### `INVALID_COMMAND`

`LearnErrorCode` gains `INVALID_COMMAND`, the code every SDK in the family uses for a refused command (ADR 0045, section 8). Its `details` give the command's `type`, when it has one, and a stable `reason`, never the command's text:

| Reason | When |
|---|---|
| `malformed-command` | Not a command of a known shape: missing or unknown fields, wrong types, not plain data |
| `unknown-command` | A `type` this version doesn't know |
| `unknown-exercise` | No exercise has the `exerciseId` |
| `duplicate-id` | An added exercise's id is taken |
| `unknown-type` | An added exercise's type isn't registered |
| `position-out-of-range` | `at` or `to` is outside the list |
| `text-too-long` | A text over `maxTextLength`, counted in code points |
| `too-many-exercises` | An addition past `maxExercises` |

The reasons are the public `LearnCommandRejection` type, and never change meaning once released.

### Tools

The actions are tools, registered with `defineTool` and given shortcuts from the family registry ([ADR 0030](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0030-tools-and-keyboard-shortcuts.md)). In the player: `learn.check`, `learn.next`, `learn.previous`, `learn.retry` and `learn.skip`. In the editor: `learn.undo`, `learn.redo`, `learn.addExercise`, `learn.removeExercise` and `learn.moveExercise`. Each tool's state comes from the session's snapshot, such as whether there's anything to check.

## Alternatives considered

- **Mapping scores to ratings by default** (a full score as `good`, a wrong answer as `again`): every quiz would become a scheduling signal, though getting a gap wrong says little about recalling one word. Hosts that want it can still opt in with `reviewItems`.
- **Undo in the player:** a check is a record of the learner's work, already saved or saving. Undoing it would mean deleting progress, which a retry makes unnecessary.
- **Waiting for the save before showing a grade:** a slow or offline store would freeze the learner's feedback, and a failure would lose it.
- **Commands for each type's fields,** such as `learn.setChoice` or `learn.moveTile`: smaller history steps, but every new exercise type would add to the portable format, and every port would need its rules. Whole payloads are bounded by the limits, so their steps stay small.
- **Editable exercise ids:** clearer for teachers who name exercises, but every rename would orphan learners' progress.
- **Opening invalid content in the editor:** useful for repairs, but every part of the editor would have to cope with content that isn't even shaped right. It can be added later, as a separate mode.
- **Keeping skips in progress now:** it needs `hm-learn-progress` v2 before any host has asked for it.

## Consequences

- A server that stores attempts and a browser that shows the player agree on every grade, because both use `gradeAnswer`.
- Learners keep their feedback when storage fails, and hosts see the failure and can retry. A player can hold unsaved changes, which a component should warn about before the page closes.
- Spaced repetition stays meaningful: only learners' own ratings feed it by default, and the door stays open for hosts.
- `hm-learn-commands` is a fourth portable format with its own schema and vectors, which the editor's pull request adds. The five commands are enough for any exercise type the SDK adds, and only a change to the commands themselves needs a new version.
- Drafts can be invalid while publishing can't, so hosts need to keep the two apart: `onChange` gives drafts, `getContent()` gives content.
- The pull requests that follow are: the player session, then the editor session with its format and vectors, each headless; then the components.

## Amendment

- **2026-11-14:** the command format is named `hm-learn-command` (singular, one command per document), in `formats/hm-learn-command/v1.schema.json` and `docs/formats/hm-learn-command.md`, as the family names `hm-audio-command`, `hm-image-command` and `hm-video-command`. The vectors keep the plural, `conformance/hm-learn-commands.json`, because they hold many cases.
