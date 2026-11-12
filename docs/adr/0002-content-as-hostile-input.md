# 0002. Content is hostile input: size first, parse on the page, validate by shape, render as text

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

Exercises reach the SDK from teachers typing into an editor, from files a teacher imports, from a host's database, and from generators. Any of them can be wrong, and some can be malicious: a learner who edits a request, an imported file from anywhere, or a compromised account. Content is shown inside other people's applications, and graded on their servers. The family treats every input file as hostile ([ADR 0012](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md), [ADR 0020](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0020-file-policy.md)); content is the same kind of input, in JSON rather than bytes.

The other SDKs parse binary files only in workers. JSON is different: `JSON.parse` is built into every runtime, isn't a parser we or a third party wrote, and the dangers lie in what code does with its result. We measured the three that matter, on 2026-11-12, in Node 24.21.0 and, through Playwright, in Chromium 158, Firefox 159 and WebKit 27.2:

- **Nesting:** `JSON.parse` accepted arrays nested 1,000,000 deep in all four runtimes. But a recursive walk of the result failed at 10,000 levels (about 20 KB of brackets) in Node and Chromium, and at 100,000 in Firefox and WebKit. `JSON.stringify` failed at 10,000 in Node and Firefox, and at 100,000 in WebKit.

  | Depth | Node: walk / stringify | Chromium | Firefox | WebKit |
  |---|---|---|---|---|
  | 1,000 | ok / ok | ok / ok | ok / ok | ok / ok |
  | 10,000 | RangeError / RangeError | RangeError / ok | ok / InternalError | ok / ok |
  | 100,000 | RangeError / RangeError | RangeError / ok | InternalError / InternalError | RangeError / RangeError |

  So **a size limit doesn't protect against depth**: 20 KB is far below any sensible content size. Code must never follow untrusted nesting.
- **`__proto__`:** `JSON.parse('{"__proto__": {"polluted": true}}')` creates an own property named `__proto__` in every runtime, and changes no prototype. Copying it with spread doesn't either. But `Object.assign({}, parsed)` **does set the copy's prototype** to the attacker's object, in all four. So the danger is in copying parsed objects, not in parsing them.
- **Speed:** 2.0 MB of realistic content (1,351 multiple-choice exercises of 10 questions each, with Thai text) parsed in a median of 5.4 ms in Node, 2.8 ms in Chromium, 19 ms in Firefox and 6.0 ms in WebKit, on the development machine. A slow phone can be several times slower, still well within a frame budget for a one-off load.

## Decision

### The order of checks

`parseContent(input, { limits, types, profile })` accepts a JSON string or an already-parsed value, and returns validated content or throws `LearnError`:

1. **Size, before anything else,** when the input is a string: its UTF-8 size is checked against `maxContentSize`. Too large fails with `CONTENT_TOO_LARGE`, without parsing.
2. **`JSON.parse`,** on the page, in a `try`. A syntax error becomes `INVALID_CONTENT` with the issue `not-json`, never the runtime's message.
3. **Validation by shape:**
   - Validators walk the **expected** shape only: the content object, its exercise list, each exercise's fields, and the payload fields each type defines. They never recurse into a value they don't expect. A field of the wrong type is an issue, whatever it contains, so untrusted depth is never followed.
   - They read **own properties only** (`Object.hasOwn`), and report any field they don't know, including `__proto__` and `constructor`, as an issue (`unknown-field`).
   - They **build fresh objects** from the fields they checked, with object literals. Parsed objects are never kept, spread or passed to `Object.assign`, so nothing the input controls reaches the result except checked values.
   - `version` must be a known format version; otherwise `UNSUPPORTED_CONTENT_VERSION`.
   - Exercise ids must be unique, and every exercise's `type` must be in `types`. Each type's `validate` checks its payload the same way.
4. **Counts and lengths,** while validating, through `learnLimits` (below). A count or length over its limit stops validation at once and throws that limit's code, so a hostile list is never walked to its end.

Structural problems are collected as issues, each with a `path` (such as `["exercises", 3, "payload", "choices", 1]`), a `code` and `details`, and thrown together as `INVALID_CONTENT`, up to 100 issues. Every issue code has a message under `validation.<code>` in the catalogue, and a test checks that none is missing.

An already-parsed value skips steps 1 and 2, because its size can't be measured cheaply. Counts, lengths and shape still bound every walk.

### Where it runs

On the page, and on servers, in the same function. No worker: `JSON.parse` isn't hostile-input code we own, the measured parse times are small, and validation does work proportional to the limits. This differs on purpose from the binary SDKs, which parse files in workers; it's recorded here so that nobody "fixes" it.

### The limits

`learnLimits` is `coreLimits` plus six learn limits, defined with `defineLimits` so that violations throw `LearnError`. Hosts change them through the `limits` prop ([ADR 0001](0001-package-shape-props-and-ports.md)).

| Limit | Code | Unit | Default maximum | Default warning | Checked |
|---|---|---|---|---|---|
| `maxContentSize` | `CONTENT_TOO_LARGE` | bytes | 2 MB | 512 kB | A content string's UTF-8 size, before parsing |
| `maxExercises` | `TOO_MANY_EXERCISES` | count | 500 | none | The exercise list's length, before its items are read |
| `maxItems` | `TOO_MANY_ITEMS` | count | 100 | none | The items in one exercise: questions, gaps, sentences, pairs, cards or dialogue lines |
| `maxChoices` | `TOO_MANY_CHOICES` | count | 8 | none | The choices or options of one item |
| `maxTiles` | `TOO_MANY_TILES` | count | 30 | none | The tiles of one word-order item |
| `maxTextLength` | `TEXT_TOO_LONG` | count | 2,000 | none | Every string in content and answers, in UTF-16 code units, including ids and audio references |
| `maxFileSize` (core) | `FILE_TOO_LARGE` | bytes | 5 MB | 1 MB | Each audio clip an `AudioSource` returns, before a `blob:` URL is created (ADR 0003) |

The core's `maxFiles`, `maxDecodedSize` and `maxProcessingTime` keep their defaults and aren't checked: the SDK opens no files and decodes nothing itself, and validation is bounded by the counts above.

The defaults leave room for real courses: the 2 MB we measured holds 1,351 exercises of 10 questions each, nearly three times `maxExercises`. Answers are validated against the same limits.

### Rendering

- **Text only.** Every string from content or answers is rendered as text: React text children in the components, `textContent` in the element. Never HTML, Markdown or links; nothing becomes an attribute that the browser interprets as a URL, style or event handler.
- **Enforced** by Biome's `noDangerouslySetInnerHtml` rule, and by a browser test that renders content full of HTML, Markdown, `javascript:` URLs and `<script>` text, and asserts that no element, link or request results.
- **Media references** are opaque strings, length-limited, and passed only to the host's `AudioSource`. The SDK never uses one as a URL.

## Alternatives considered

- **Parsing in a worker,** as the binary SDKs do: it adds a worker and its assets to every host for a built-in parser that is fast and safe; the risks are in the code after parsing, which a worker doesn't remove.
- **A schema library such as zod:** it validates by shape too, but adds its size to every host, and its error messages are English text, against the family's message catalogues. Recorded in ADR 0004.
- **Rejecting deep JSON with a depth-counting parser of our own:** more code to get right, when never following unexpected nesting avoids the problem entirely.
- **Dropping unknown fields silently:** typos in a teacher's content would vanish without a word, and a `__proto__` key would pass. Reporting them, with a versioned format for real changes, is safer.
- **Sanitised HTML or Markdown in content:** teachers might like bold text, but a sanitiser is a large, security-critical dependency. If formatting is ever needed, it becomes a small, typed structure in the content format, in its own ADR.

## Consequences

- Content can't run script, change prototypes or exhaust the stack in any host, whether it arrives as a string or an object, in a browser or on a server.
- Teachers get precise feedback: every issue names the exact place and has a translatable message.
- Unknown fields are rejected, so the format must be versioned, and new fields arrive with a new version and a migration.
- Content is plain text. Formatting would need a new ADR.
- The limits are starting points. The feature pull requests measure validation time against them and revisit the defaults if needed.
