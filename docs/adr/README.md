# Architecture decision records

Decisions specific to `@hussmartinez/learn-sdk`. Decisions for the whole SDK family live in [`sdk-core`'s `docs/adr`](https://github.com/ie-huss-martinez/sdk-core/tree/main/docs/adr); the records here build on them and never contradict them. To change a family decision, write a record in `sdk-core`.

Each record captures one significant decision: the context that forced it, what we chose, the alternatives we rejected and the consequences we accept. Records are numbered and immutable. To change a decision, write a new record that supersedes the old one and link the two.

Use [`template.md`](template.md) for new records. Name files `NNNN-short-title.md`, taking the next free number.

| # | Decision | Status |
|---|---|---|
| [0001](0001-package-shape-props-and-ports.md) | Package shape: a server-safe core, a player and an editor, and three ports | Accepted; its content model refined by [0006](0006-portable-formats.md) |
| [0002](0002-content-as-hostile-input.md) | Content is hostile input: size first, parse on the page, validate by shape, render as text | Accepted; its rejection codes and length unit superseded by [0006](0006-portable-formats.md) |
| [0003](0003-learners-data-events-and-audio.md) | Learners' data stays with the host; audio arrives as bytes; no speech synthesis | Accepted; its stored format refined by [0006](0006-portable-formats.md) |
| [0004](0004-dependencies-validators-and-fsrs.md) | Dependencies: hand-written validators, FSRS-7 through ts-fsrs, and nothing from ICU | Accepted |
| [0005](0005-accessible-exercise-types.md) | Every exercise works with the keyboard and a single tap; drag is only an enhancement | Accepted |
| [0006](0006-portable-formats.md) | Portable formats: named and versioned documents, the family's rejection codes, and lengths in code points | Accepted; supersedes parts of [0001](0001-package-shape-props-and-ports.md), [0002](0002-content-as-hostile-input.md) and [0003](0003-learners-data-events-and-audio.md) |
