# 0006. Portable formats: named and versioned documents, the family's rejection codes, and lengths in code points

- **Status:** Accepted; supersedes parts of [0001](0001-package-shape-props-and-ports.md), [0002](0002-content-as-hostile-input.md) and [0003](0003-learners-data-events-and-audio.md), as listed below
- **Date:** 2026-11-14

## Context

The family now requires every persisted or exchanged format to be versioned, documented JSON with a JSON Schema and language-neutral conformance vectors, so a port in another language can be proven to behave identically ([sdk-core ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md)). Its section 8 fixes the conventions every SDK follows: the same rejection codes with a `details.reason`, strict schemas and readers, hostile keys as ordinary keys, and lengths counted in Unicode code points.

learn-sdk was designed before that record, and three of its decisions differ:

- **Its documents carry a version but no format name:** content is `{ version: 1, exercises }` ([ADR 0001](0001-package-shape-props-and-ports.md)), and the device-storage adapter stores `{ version: 1, attempts, cards }` ([ADR 0003](0003-learners-data-events-and-audio.md)).
- **It rejects documents with its own codes:** `INVALID_CONTENT` and `UNSUPPORTED_CONTENT_VERSION` ([ADR 0002](0002-content-as-hostile-input.md)), where the family uses `INVALID_DOCUMENT` and `UNSUPPORTED_FORMAT`.
- **`maxTextLength` counts UTF-16 code units** ([ADR 0002](0002-content-as-hostile-input.md)), where the family counts code points.

The package hasn't been published, so aligning now breaks no one; after 0.1.0 it would.

## Decision

### Two formats

| Format | Version | What it holds |
|---|---|---|
| `hm-learn-content` | 1 | A set of exercises: `{ "format": "hm-learn-content", "version": 1, "exercises": [ … ] }`. Each exercise is `{ id, type, title?, instructions?, payload }` as [ADR 0001](0001-package-shape-props-and-ports.md) describes it. |
| `hm-learn-progress` | 1 | One scope's progress: `{ "format": "hm-learn-progress", "version": 1, "attempts": [ … ], "cards": [ … ] }`, with attempts and cards as [ADR 0003](0003-learners-data-events-and-audio.md) describes them. |

- **Schemas:** `formats/hm-learn-content/v1.schema.json` and `formats/hm-learn-progress/v1.schema.json`, JSON Schema draft 2020-12, with `additionalProperties: false` on every object. They ship in the package (`files`), under `@hussmartinez/learn-sdk/formats/*`, so a host validates against the version its installed reader reads. Each format has a record in `docs/formats/`.
- **Exercise payloads:** the content schema describes the payload of each built-in type (`multiple-choice`, `gap-fill`, `word-order`, and the types still to come). An exercise of any other type is a host's, and its payload is only required to be an object: its type's own validator checks it, as now.
- **Readers stay hand-written** ([ADR 0004](0004-dependencies-validators-and-fsrs.md)), and must accept exactly what the schemas accept, beyond what a schema can't express: unique exercise ids, a choice that's in range, a gap that exists. A property test checks that the runtime never accepts a document its schema refuses. Schema validation is test-only, with no new runtime dependency (ADR 0045, section 6).
- **`parseContent` reads `hm-learn-content`,** and the content it returns carries `format` and `version`, so it can be stored as it is. The progress reader becomes public, as `parseProgress`, so a host storing progress on its own server reads it the same way the device-storage adapter does.

### Opaque fields in `hm-learn-progress`

Two fields hold data that belongs to someone else:

- **`scheduling.card`,** the scheduler's own state, and
- **an attempt's `answer`,** whose shape is its exercise type's.

Readers check that each is a JSON value and nothing more. They copy it unchanged, never reshaping or computing it, so a scheduler or exercise type reads back exactly what it wrote ([ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md), section 4). The scheduler's envelope (`scheduler`, `model`, `version`) is checked as part of the format. A change inside a scheduler's state, such as a new FSRS model, is versioned by that envelope and needs no new `hm-learn-progress` version. Only a change to the progress envelope itself does.

### The family's rejection codes, with reasons

Every rejection a conformance vector can reach carries a stable `details.reason`, and is compared by code and reason, never by message:

| Code | When | Reasons |
|---|---|---|
| `UNSUPPORTED_FORMAT` | A document of another format, or of a version this release doesn't read | `unknown-format`, `unknown-format-version` |
| `INVALID_DOCUMENT` | Any other invalid content or progress document | `not-json`, `malformed-document` |
| `INVALID_ANSWER` | A learner's answer that doesn't fit its exercise | `malformed-answer` |
| `UNSUPPORTED_SCHEDULING_STATE` | A scheduler given another's state, or a malformed one | `unknown-scheduler`, `malformed-state` |

- **`INVALID_DOCUMENT` and `INVALID_ANSWER` keep the issue list** of [ADR 0002](0002-content-as-hostile-input.md) in `details.issues`: each issue's path, its code (`required`, `unknown-field`, `duplicate-choice` …) and numbers. The reason says what kind of failure it is; the issues say where.
- **Limit errors** (`CONTENT_TOO_LARGE`, `TOO_MANY_ITEMS` …) keep sdk-core's `details`, whose `limit` names the limit, and vectors compare that in place of a reason.
- **`INVALID_CONTENT` and `UNSUPPORTED_CONTENT_VERSION` are removed** from `LearnErrorCode`.

### Lengths in code points

`maxTextLength` counts **Unicode code points** (`[...text].length`), the unit JSON Schema's `maxLength` uses, in content, answers and stored progress. A text of 2,000 emoji fits, though it's 4,000 UTF-16 units. `maxContentSize` is unchanged: it's a size in UTF-8 bytes, not a length. Counts of list entries are unchanged.

### Hostile keys

learn-sdk's ids live in lists, never as object keys, so no reader uses ids as keys. Field names such as `__proto__`, `constructor` and `toString` are refused as unknown fields, and the conformance vectors include each of them, so every port is checked the same way.

### What this supersedes

- **[ADR 0001](0001-package-shape-props-and-ports.md):** the content model's `{ version: 1, exercises }` becomes `hm-learn-content` with `format` and `version`.
- **[ADR 0002](0002-content-as-hostile-input.md):**
  - `INVALID_CONTENT` becomes `INVALID_DOCUMENT`, and `UNSUPPORTED_CONTENT_VERSION` becomes `UNSUPPORTED_FORMAT`, each with the reasons above;
  - `maxTextLength` counts code points, not UTF-16 code units.

  Everything else in it stands: the order of checks, validation by shape, the limits and their defaults, and text-only rendering.
- **[ADR 0003](0003-learners-data-events-and-audio.md):** the device-storage adapter stores `hm-learn-progress` documents, through `parseProgress`. The rest stands.

## Alternatives considered

- **Keeping learn-sdk's own codes alongside the family's:** hosts using several SDKs would handle the same failure two ways, and the vectors would need a mapping.
- **Counting UTF-16 units and documenting it:** a port in Rust, Python or Go would have to emulate a JavaScript detail, and the schema's `maxLength` would disagree with the reader, the mismatch video-sdk's adoption found.
- **Validating scheduler state inside `hm-learn-progress`:** every scheduler change would need a progress format version, and the format would depend on one scheduler's internals.
- **Waiting until after 0.1.0:** every change here would then be breaking.

## Consequences

- learn-sdk's documents can be checked by any language against shipped schemas, and its rejections read the same as every other SDK's.
- The changes are breaking for the unreleased API, and land in one implementation pull request, before the first publish. The initial-release changeset is rewritten, not added to.
- Counting code points costs an iteration over each text, bounded by `maxContentSize`.
