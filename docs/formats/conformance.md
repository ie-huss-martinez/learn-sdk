# Conformance vectors

learn-sdk's language-neutral test cases ([sdk-core ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md), [ADR 0006](../adr/0006-portable-formats.md)). A port in another language, such as a server in Python or Go that grades answers or stores progress, proves it behaves as this SDK does by passing them. They stay in the repository and aren't shipped in the package.

Each file is an `hm-conformance` document, which `@hussmartinez/sdk-config`'s schema describes: a `subject`, a `description`, and `cases`, each with a `name`, an `input` and the `expected` result.

| File | Subject | A case's input | Its expected result |
|---|---|---|---|
| [`hm-learn-content.json`](../../conformance/hm-learn-content.json) | Reading [`hm-learn-content`](hm-learn-content.md) | `{ document, limits? }` | The content as the reader returns it |
| [`hm-learn-progress.json`](../../conformance/hm-learn-progress.json) | Reading [`hm-learn-progress`](hm-learn-progress.md) | `{ document, limits? }` | The document as the reader writes it back |
| [`hm-learn-grading.json`](../../conformance/hm-learn-grading.json) | Grading an answer | `{ exercise, answer }` | The grade: `{ score, max, items }` |
| [`hm-learn-access.json`](../../conformance/hm-learn-access.json) | Which courses a learner may open | `{ learner, courses }` | The course codes, in course order |
| [`hm-learn-progress-changes.json`](../../conformance/hm-learn-progress-changes.json) | Applying changes to progress | `{ progress, changes }` | The `hm-learn-progress` document after them |
| [`hm-learn-scheduling.json`](../../conformance/hm-learn-scheduling.json) | Spaced repetition | `{ scheduler, options?, start or state, reviews }` | Every scheduling state in turn, with its due time |
| [`hm-learn-commands.json`](../../conformance/hm-learn-commands.json) | Applying [`hm-learn-command`](hm-learn-command.md) | `{ document, commands, limits? }` | The draft after every command; their inverses, in reverse order, must restore the content |

Any case may instead expect a rejection, `{ "error": { "code", "reason"? } }`.

## Running them

- **Results** are compared as JSON values, exactly, except within a case's `tolerance`, which applies to every number. Only the FSRS-7 cases have one, `1e-9`, because their states hold computed floats.
- **Rejections** are compared by `code` and, when the case gives one, `details.reason`, never by message. A limit's rejection gives only its code, such as `TEXT_TOO_LONG`, which names the limit.
- **Documents** are given as JSON values, or as JSON text when a case reads text: a string `document` is parsed by the reader, after checking its size in UTF-8 bytes. Keys such as `__proto__` appear in the files as ordinary JSON keys, and a port must read them as such.
- **Limits:** `limits`, when given, overrides learn-sdk's default limits for that case only.
- **The host's exercise types:** the reader knows the built-in types (`multiple-choice`, `gap-fill`, `word-order`) and one host type, `"free-form"`, whose payload is any object, returned unchanged. A port registers it the same way.
- **Grading** reads the exercise as an `hm-learn-content` document holding just that exercise, then grades with the default language profile: Unicode NFC, and nothing else. No case folding, no trimming, no locale rules and no ICU. Thai text is compared as NFC leaves it, so sara am written as nikhahit and sara aa doesn't match the precomposed form: unifying them is a Thai profile's job, not the default's.
- **Scheduling:** `"fsrs"` is FSRS-7 without fuzzing, with optional `desiredRetention` and `weights`; `"fake"` is the fake scheduler from `@hussmartinez/learn-sdk/testing`. `start` begins with a new item's state at that time and includes it in the result; `state` continues from a stored one. Times are milliseconds since the Unix epoch.
- **Progress changes:** an attempt is appended; a review replaces its item's card where it already is, or appends a new item's card.
- **Commands** apply in order to the content, which is read with `parseContent` first. The result is a draft, which may be invalid content. A port also applies each command's inverse, in reverse order, and checks that it restores the content exactly; the inverses themselves aren't compared, only what they do.
- **Course order:** courses are sorted by `position`, and courses at the same position keep the order given.

In TypeScript, `test/conformance/run.ts` is the runner for each subject, and `describeConformance` from `@hussmartinez/sdk-config/testing/conformance` registers a test for each case.

## How they're made

`test/conformance/generate.ts` writes the files.

- **Hand-written cases** cover every outcome. Each one names the outcome it's meant to have, and generation fails if the SDK disagrees.
- **Generated cases** come from the schema properties' generators, with a fixed seed: for each format, 15 documents the reader accepts and 15 it refuses; for commands, 15 runs of up to three commands that apply and 15 that are refused.

`pnpm conformance:update` rewrites the files, and the tests fail when the checked-in files differ from what the generator writes. Biome doesn't format them, so the generator's output is what's checked in.

The tests also check that the format schemas agree with the readers. Every document the vectors read passes its schema, and over thousands of generated and mutated documents, neither reader accepts one its schema refuses, and `applyLearnCommand` applies no command its schema refuses (`test/formats.test.ts`).

## Changing them

- **A change in behaviour** shows as a changed expected result. It's reviewed like any other change to the API.
- **A breaking change to a format** is a new version, with its own schema beside version 1 and a migration from it (ADR 0045, section 1). A reader refuses a later version with `UNSUPPORTED_FORMAT` and `unknown-format-version`.
