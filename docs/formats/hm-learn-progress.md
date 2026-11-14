# `hm-learn-progress`, version 1

learn-sdk's progress format: one scope's attempts and spaced-repetition cards, as a progress store keeps them ([ADR 0006](../adr/0006-portable-formats.md), [sdk-core ADR 0045](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0045-portable-formats-and-conformance-vectors.md)). Its schema is [`formats/hm-learn-progress/v1.schema.json`](../../formats/hm-learn-progress/v1.schema.json).

```json
{
  "format": "hm-learn-progress",
  "version": 1,
  "attempts": [
    {
      "exerciseId": "food-1",
      "answer": { "selected": [0] },
      "grade": { "score": 1, "max": 1, "items": [true] },
      "at": 1767225600000
    }
  ],
  "cards": [
    {
      "itemId": "กิน",
      "scheduling": { "scheduler": "fsrs", "model": "FSRS-7", "version": 1, "card": { "stability": 3.9 } },
      "due": 1767398400000
    }
  ]
}
```

- **Attempts** record a graded answer: the exercise's id, the learner's `answer`, its `grade` and when it was given.
- **Cards** hold each item's latest scheduling state and when it's next due. A later review replaces its item's card.
- **Times** are whole milliseconds since the Unix epoch, after it.
- **Opaque values:** an attempt's `answer` has its exercise type's shape, and `scheduling.card` its scheduler's. Readers check only that each is a JSON value, and copy it unchanged, so a type or scheduler reads back exactly what it wrote. Keys such as `__proto__` in them are ordinary data, read as own properties only.
- **Scheduler states** are versioned by their envelope, `scheduler`, `model` and `version`, not by this format. A scheduler refuses another's state with `UNSUPPORTED_SCHEDULING_STATE` (`unknown-scheduler`), and a malformed one of its own with `malformed-state`.
- **Texts** (`exerciseId`, `itemId`, `scheduler`, `model`) follow [`hm-learn-content`](hm-learn-content.md)'s rule: 1 to 2,000 code points, not only white space.
- **Beyond the schema,** readers check that a grade's `score` is at most its `max`, and that a document is at most 2,000,000 UTF-8 bytes by default.
- **Strict:** an unknown field in any object of fixed shape is refused, never dropped.

`toProgressDocument(snapshot)` writes a document and `parseProgress(input)` reads one back, as untrusted input, throwing `UNSUPPORTED_FORMAT`, `INVALID_DOCUMENT` or `CONTENT_TOO_LARGE`. The device store, `createLocalProgressStore`, uses both, and a host keeping progress on its own server can do the same.

The schema ships with the package, at `@hussmartinez/learn-sdk/formats/hm-learn-progress/v1.schema.json`; [`hm-learn-content`](hm-learn-content.md#validating-elsewhere) shows how to load one.
