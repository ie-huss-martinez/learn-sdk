# `hm-learn-command`, version 1

learn-sdk's edit commands: every change a teacher's editor makes to a draft of [`hm-learn-content`](hm-learn-content.md) ([ADR 0007](../adr/0007-player-and-editor-sessions.md), [sdk-core ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md)). Commands are plain JSON, so a host can store them, sync them between devices, or replay them on a server. Each command's inverse is a command too, which is how undo works. Its schema is [`formats/hm-learn-command/v1.schema.json`](../../formats/hm-learn-command/v1.schema.json), and it describes one command.

| Command | Fields | Its inverse |
|---|---|---|
| `learn.addExercise` | `exercise` (`{ id, type, title?, instructions?, payload }`), `at`, from 0 to the number of exercises | `learn.removeExercise` |
| `learn.removeExercise` | `exerciseId` | `learn.addExercise`, with the exercise as it was, where it was |
| `learn.moveExercise` | `exerciseId`, `to`, from 0 to one less than the number of exercises | `learn.moveExercise` back |
| `learn.setExerciseText` | `exerciseId`, `field` (`title` or `instructions`), `value` (text, or `null` to remove it) | `learn.setExerciseText` with the old value |
| `learn.setPayload` | `exerciseId`, `payload` | `learn.setPayload` with the old payload |

```json
{ "type": "learn.setExerciseText", "exerciseId": "food-1", "field": "title", "value": "อาหาร" }
```

- **Drafts may be invalid:** a command never checks the payload against its exercise type, so a teacher can add an empty exercise and fill it in. The editor lists the draft's issues after every command, and only valid content is published.
- **Payloads are replaced whole,** as the type's editor builds them, so a new exercise type never adds commands.
- **Exercise ids are fixed:** no command renames one, because learners' progress refers to exercises by id.
- **Texts** are at most 2,000 Unicode code points, the default `maxTextLength`: an exercise's id, type, title and instructions, and every string and key anywhere in a payload. Ids, types, titles and instructions also have a character that isn't white space.
- **Hostile keys:** in a command or an added exercise, `__proto__`, `constructor` and `toString` are unknown fields and refused. In a payload they're ordinary data. Exercise ids are values, compared in a list, so an id such as `__proto__` is an ordinary id.
- **Beyond the schema,** the reducer checks each command against the draft it applies to: the exercise exists, or doesn't when one is added; an added exercise's type is registered; a position is within the list; an addition stays within `maxExercises`; and a payload is nested at most 64 levels deep. Nothing is corrected: a position out of range is refused, not clamped.
- **Strict:** an unknown field is refused, never dropped.

`applyLearnCommand(draft, command, { types })` applies a command, as untrusted input, and returns the new draft with the command that undoes it. It throws `INVALID_COMMAND`, with one of these reasons:

| Reason | When |
|---|---|
| `malformed-command` | Not a command of a known shape: a missing, unknown or mistyped field, a blank id, or a value that isn't JSON |
| `unknown-command` | A `type` this version doesn't know |
| `unknown-exercise` | No exercise has the `exerciseId` |
| `duplicate-id` | An added exercise's id is taken |
| `unknown-type` | An added exercise's type isn't registered |
| `position-out-of-range` | `at` or `to` is outside the list |
| `text-too-long` | A text over `maxTextLength`, counted in code points |
| `too-many-exercises` | An addition past `maxExercises` |

A port in another language proves it applies commands as this SDK does by passing [`conformance/hm-learn-commands.json`](../../conformance/hm-learn-commands.json); [Conformance vectors](conformance.md) explains how to run them.
