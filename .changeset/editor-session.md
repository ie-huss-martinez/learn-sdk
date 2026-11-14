---
"@hussmartinez/learn-sdk": minor
---

Add the teacher's editor session and its portable edit commands, headless, so React and the custom element can wrap them later (ADR 0007).

- **`createLearnEditor({ initialContent, types, limits, newId, onChange, onEvent })`** opens valid `hm-learn-content`, or starts empty, and returns a store (`getSnapshot`, `subscribe`) with `execute(command)`, `group(fn)`, `undo()`, `redo()`, `getContent()` and `newExerciseId()`. The snapshot holds the `draft`, its `issues` (each with the path to its field, from the same validators as `parseContent`), an `error` when the whole draft exceeds a limit, `canUndo`, `canRedo` and `trimmed`.
- **Drafts may be invalid while a teacher works,** such as a new exercise with no questions yet. `onChange(draft, { issues })` reports every change, so you can keep drafts; `getContent()` returns validated content for publishing, or throws `INVALID_DOCUMENT` with every issue.
- **Undo instead of confirmation:** every edit is one undoable step, and `group(fn)` makes a burst of edits, such as typing in a field, one step. The history keeps 500 steps; `trimmed` says when the earliest were dropped.
- **Edit commands, `hm-learn-command` v1:** `learn.addExercise`, `learn.removeExercise`, `learn.moveExercise`, `learn.setExerciseText` and `learn.setPayload`, plain JSON with a JSON Schema in `@hussmartinez/learn-sdk/formats/hm-learn-command/v1.schema.json`, documented in `docs/formats/hm-learn-command.md`. `applyLearnCommand(draft, command, { types, limits })` applies one and returns the new draft with the command that undoes it, so a server can replay stored or synced commands exactly as the editor does. Exercise ids are fixed once created, because progress refers to them.
- **Commands are untrusted input:** each is copied and checked by shape, and every text in it, including texts and keys inside a payload, is measured against `maxTextLength` in code points. A refused command throws `INVALID_COMMAND` with a `details.reason` (`LearnCommandRejection`): `malformed-command`, `unknown-command`, `unknown-exercise`, `duplicate-id`, `unknown-type`, `position-out-of-range`, `text-too-long` or `too-many-exercises`.
- **Usage events** are `content_edited` with the command's type, `edit_undone` and `edit_redone`: never content or ids.
- **Tools:** `learnEditorTools` (`undoTool`, `redoTool` and `removeExerciseTool`, which removes the selected exercise) with the family's undo, redo and delete shortcuts, and labels in `learnMessages`.
