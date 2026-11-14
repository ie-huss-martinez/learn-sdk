---
"@hussmartinez/learn-sdk": minor
---

Add `LearnPlayer`, the learner's player for React (`@hussmartinez/learn-sdk/react`), with blocks for multiple choice, gap fill and word order (ADR 0005, ADR 0007).

```tsx
import "@hussmartinez/ui/styles.css";
import "@hussmartinez/learn-sdk/styles.css";
import { LearnPlayer } from "@hussmartinez/learn-sdk/react";

<LearnPlayer content={content} profile={{ code: "th", direction: "ltr" }} onProgress={save} />
```

- **One exercise at a time,** with Check, Previous, Try again, Skip and Next, and `Mod+Enter` to check. Each check's result shows with an icon and text, never colour alone, along with the right answer, and is announced in a polite live region. Once every exercise is checked or skipped, the player sums up.
- **Keyboard and single taps only:** each group of choices or tiles is one Tab stop, with the arrow keys, Home and End inside it. In word order, choosing a word places it and choosing a placed word returns it, and Alt with an arrow moves a placed word; every move is announced. Choices that can't be chosen any more stay focusable with `aria-disabled`. After moving on, focus goes to the new exercise's heading.
- **The learned language** is marked with the profile's `lang` and `dir`.
- **Props:** `content`, `types`, `profile`, `progressStore` with `scope`, `scheduler`, `limits`, `onProgress`, `onEvent`, `onError`, `messages`, `locale` and `className`, as the session takes them. Invalid content shows its error instead of the exercises. If saving fails, the player says so and offers to try again. A ref gives `check()`, `next()` and `reset()`.
- **Your own exercise types:** pass a block per type in `blocks`, written with `definePlayerBlock`; it gets the exercise, the answer so far, `onAnswer`, the grade once checked, the profile, the messages and `announce`. `MultipleChoicePlayer`, `GapFillPlayer` and `WordOrderPlayer` are the built-in blocks.
- **Text:** `learnMessages` adds the player's text (`player.*`, `multipleChoice.*`, `gapFill.*`, `wordOrder.*`); `playerCatalogue` joins it with ui's, and `messages` overrides any of it.
