---
"@hussmartinez/learn-sdk": minor
---

Add the learner's player session, headless, so it runs anywhere and React and the custom element can wrap it later (ADR 0007).

- **`createLearnPlayer({ content, types, profile, progressStore, scope, scheduler, now, onProgress, onEvent, onError })`** reads content with `parseContent` and returns a store (`getSnapshot`, `subscribe`) with the learner's actions: `answer`, `check`, `next`, `previous`, `retry` and `skip`. The snapshot holds each exercise's status, draft and grade, the current position, what the learner `can` do now, the `summary` once every exercise is checked or skipped, and whether progress is saved. Actions the snapshot doesn't allow change nothing.
- **Checking** grades with `gradeAnswer`, as a server does, and records one attempt, which goes to `onProgress` at once and to the progress store in order. A draft that doesn't fit its exercise throws `INVALID_ANSWER` and changes nothing. Skipped exercises count as neither right nor wrong, and record nothing.
- **Saving never blocks the learner:** the grade shows at once. If a save fails, `save` becomes `"failed"`, `onError` gets `STORAGE_UNAVAILABLE`, the changes stay queued, and `retrySave()` saves them and any since, in order. `settled()` resolves once saving is done, and `dispose()` stops it.
- **Spaced repetition only from the learner's own ratings:** an exercise type may define `reviewItems(payload, answer, grade)`, returning `ReviewedItem`s (`{ itemId, rating }`). With a `scheduler`, checking such a type reviews each item from its card in the learner's progress. No built-in quiz type defines it, so quiz answers never become scheduling signals unless you opt a type in with your own `reviewItems`.
- **Usage events** (`onEvent`) are `exercise_checked`, with the exercise type and its number of items, and `player_completed`, with the number of exercises: never answers, ids or scores.
- **Tools:** `learnPlayerTools` (`checkTool`, `nextTool`, `previousTool`, `retryTool`, `skipTool`) are the player's actions for a toolbar, with labels in `learnMessages` (`tools.check` …) and `Mod+Enter` to check.
