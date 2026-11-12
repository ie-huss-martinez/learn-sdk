# learn-sdk

A learning SDK: exercise types with their grading logic, a player and a teacher editor for each, spaced repetition, and course-based access, for language learning and beyond. Learners' answers and progress stay with the host application; the SDK makes no network requests of its own. It offers a headless core that also runs on servers, React components (`LearnPlayer`, `LearnEditor`) and a `<hm-learn-player>` custom element.

This repository will publish **`@hussmartinez/learn-sdk`**. It follows the family standards in [`sdk-core`'s `STANDARDS.md`](https://github.com/ie-huss-martinez/sdk-core/blob/main/STANDARDS.md), and in particular the decisions on [hostile input and no network](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0012-hostile-input-and-no-network.md), [ports and adapters](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0008-ports-adapters-and-session.md) and [accessibility and translatable text](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0014-accessibility-and-translatable-text.md).

> Status: being bootstrapped. No packages are published yet.

## License

[Apache-2.0](LICENSE)
