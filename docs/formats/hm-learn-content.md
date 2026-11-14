# `hm-learn-content`, version 1

learn-sdk's content format: a set of exercises, as a teacher writes them and a player shows them ([ADR 0006](../adr/0006-portable-formats.md), [sdk-core ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md)). Its schema is [`formats/hm-learn-content/v1.schema.json`](../../formats/hm-learn-content/v1.schema.json).

```json
{
  "format": "hm-learn-content",
  "version": 1,
  "exercises": [
    {
      "id": "food-1",
      "type": "multiple-choice",
      "title": "Food",
      "payload": {
        "questions": [{ "prompt": "กิน", "choices": ["eat", "drink"], "correct": 0 }]
      }
    },
    {
      "id": "food-2",
      "type": "gap-fill",
      "payload": { "items": [{ "sentence": "ฉัน ___ ข้าว", "answers": ["กิน"], "translation": "I eat rice" }] }
    },
    {
      "id": "food-3",
      "type": "word-order",
      "payload": { "items": [{ "tiles": ["ฉัน", "กิน", "ข้าว"] }] }
    }
  ]
}
```

- **Exercises** are `{ id, type, title?, instructions?, payload }`. Ids are unique within the document, and live in a list, never as object keys.
- **Built-in payloads:** the schema describes `multiple-choice`, `gap-fill` and `word-order`. An exercise of any other type is a host's: its payload is an object, which the host's exercise type validates.
- **Texts** are 1 to 2,000 Unicode code points, the default `maxTextLength`, with at least one character that isn't white space, as ECMAScript's `String.prototype.trim` defines it. The schema spells that set out rather than using `\S`, whose meaning varies between regular expression engines.
- **Counts** are the default limits: at most 500 exercises, 100 questions or items per exercise, 8 choices, answers, options or alternatives, and 30 tiles. A host can lower or raise them with `limits`; the schema states the defaults.
- **Size:** a document is at most 2,000,000 UTF-8 bytes by default. A schema can't express that, so readers check it before parsing.
- **Beyond the schema,** readers check what depends on more than one field: unique ids, a registered type, a `correct` choice within the choices, exactly one gap (three or more underscores) in a gap-fill sentence, distinct choices and options compared after NFC and trimming, an answer among the options, and word-order alternatives that use exactly the tiles.
- **Hostile keys:** in an object of fixed shape, `__proto__`, `constructor` and `toString` are unknown fields and refused. In a host type's payload they're ordinary data, read as own properties and copied unchanged.
- **Strict:** an unknown field in any object of fixed shape is refused, never dropped, so a later version's document can't be misread as this one.

A port in another language proves it reads `hm-learn-content` as this SDK does by passing [`conformance/hm-learn-content.json`](../../conformance/hm-learn-content.json); [Conformance vectors](conformance.md) explains how to run them.

`parseContent(input, { types })` reads a document and returns it validated, with its `format` and `version`, so it can be stored as it is. It throws `UNSUPPORTED_FORMAT` (`unknown-format`, `unknown-format-version`), `INVALID_DOCUMENT` (`not-json`, `malformed-document`, with every issue's path) or a limit's code.

## Validating elsewhere

The schemas ship with the package, under `@hussmartinez/learn-sdk/formats/`, so a host validates against the version its installed reader reads. `parseContent` already checks everything the schema does and more; a host needs the schema only to validate elsewhere, such as in an authoring tool or another language.

```ts
import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "@hussmartinez/learn-sdk/formats/hm-learn-content/v1.schema.json" with { type: "json" };

const isContent = new Ajv2020({ strict: true }).compile(schema);
if (!isContent(JSON.parse(text))) console.error(isContent.errors);
```
