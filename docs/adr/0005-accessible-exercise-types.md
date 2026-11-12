# 0005. Every exercise works with the keyboard and a single tap; drag is only an enhancement

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

The family targets WCAG 2.2 AA, with a keyboard alternative for every drag, visible focus, announced results and touch targets of 44 px ([ADR 0014](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0014-accessibility-and-translatable-text.md)). Exercises are where a learning SDK is most likely to fail that:

- **The usual interactions are drags:** dragging words into order, dragging lines between pairs. WCAG 2.2 requires a single-pointer alternative to dragging (2.5.7) and keyboard operation (2.1.1).
- **Right and wrong are usually shown in colour,** which fails learners who can't tell red from green (1.4.1).
- **Results appear without a page change,** so screen-reader users need them announced (4.1.3).
- **Content mixes languages:** a Thai word and its English meaning side by side. Assistive technology needs `lang` to read each with the right voice (3.1.2).
- **Tablets are the main device** for the first host, so touch targets matter as much as keys.
- **Some exercises are timed or audio-only** in many apps, which shuts out learners who need more time or can't hear.

On 2026-11-12 we built prototypes of the two hardest types, word order and matching, from plain buttons. We drove them **with the keyboard only** through Playwright in Chromium 158, Firefox 159 and WebKit 27.2, then ran axe-core 4.14.0 with the WCAG 2.0, 2.1 and 2.2 A and AA rules.

| Prototype | Chromium | Firefox | WebKit |
|---|---|---|---|
| Word order: three tiles placed in order by keyboard, then checked | correct, 9 keys | correct, 9 keys | correct, 9 keys |
| Word order: a placed tile moved left with Alt+←, then back with Alt+→ | both moves applied | both moves applied | both moves applied |
| Matching: three pairs, choosing a term then its meaning, matched items **`disabled`** | stuck after 1 of 3 | stuck after 1 of 3 | stuck after 1 of 3 |
| Matching: the same, matched items **`aria-disabled="true"`** | 3 of 3, 17 keys | 3 of 3, 17 keys | 3 of 3, 17 keys |
| Smallest target | 44 px | 44 px | 44 px |
| axe violations | none (18 rules passed) | none (18 rules passed) | none (18 rules passed) |

The `disabled` failure is a real trap. The row's one Tab stop landed on a matched, disabled button, which can't take focus, so a keyboard user couldn't reach the remaining items at all.

## Decision

### Operation

- **Every exercise type can be completed with the keyboard alone, and with single taps or clicks alone.** No answer needs dragging, double-tapping, long-pressing, a multi-finger gesture or a precise pointer. Drag and drop may be added as an enhancement, and never as the only way.
- **Groups of choices** (tiles, choices, terms, meanings, cards) are `role="group"` with an accessible name, built from `<button>`s:
  - **one Tab stop per group,** a roving `tabindex` that remembers the last focused item;
  - **←/→** (and **↑/↓** in vertical layouts), **Home** and **End** move within the group; **Enter** or **Space** chooses;
  - selection state is `aria-pressed`.
- **Word order:** choosing a tile in the bank places it at the end of the answer; choosing a placed tile returns it. **Alt+←/→** moves a placed tile, as the keyboard alternative to dragging. Each move is announced with the tile's new position.
- **Matching:** choose a term, then its meaning. The pending choice is `aria-pressed` and announced.
- **Items that can't be chosen any more stay focusable,** with `aria-disabled="true"`, never `disabled`, so a group's Tab stop can't land on an unfocusable item. Measured above.
- **Player actions** (check, next, retry, play audio) are tools with shortcuts from the family registry ([ADR 0030](https://github.com/ie-huss-martinez/sdk-core/blob/main/docs/adr/0030-tools-and-keyboard-shortcuts.md)). Their keys are listed in the player's help, and never collide with typing in a gap.

### Feedback

- **Never by colour alone:** right and wrong carry an icon and text from the catalogue, such as "Correct" or "Not quite: 2 of 3 words placed", and colours come from tokens that meet contrast.
- **Announced:** each player has one polite live region (`role="status"`). It announces placements, moves, matches, check results and the next item's number, with catalogue messages, as plain text.
- **Focus is never lost:** after checking, focus stays where it was; after "next", it moves to the new item's prompt; nothing is left focused on a removed element.
- **The editor ties every validation issue to its field,** with `aria-invalid` and `aria-describedby` pointing to the issue's message ([ADR 0002](0002-content-as-hostile-input.md)).

### Language, time, audio and touch

- **Language of parts:** text in the language being learned is rendered with `lang` from the language profile's `code`, and `dir` from its `direction`. Interface text is in the host's `locale`.
- **No time limits by default.** A timed mode, if one is ever added, is off by default, and can be turned off or extended (2.2.1).
- **Audio:** play buttons have names, and audio never plays without an action by the learner unless the host turns on autoplay. Listening exercises test listening, so their audio has no text alternative while they're being answered (WCAG's exception for tests). Their transcript can be shown once the item is answered, and the editor asks for one.
- **Targets:** at least 44 by 44 px on touch screens, and at least 24 px elsewhere, from `--hm-*` tokens.
- **Motion:** feedback animations, such as a shake on a wrong answer, have a reduced-motion fallback.

### How it's tested

- **Per exercise type, in Chromium, Firefox and WebKit:**
  - a keyboard-only end-to-end test that completes the exercise, like the prototypes above;
  - axe, with the WCAG 2.2 AA rules, in each state: unanswered, part-answered, checked;
  - a target-size check.
- **A screen-reader pass** with VoiceOver on iOS and macOS, NVDA on Windows and TalkBack on Android, before the first release and for each new exercise type. It's recorded in that pull request, because no automated test can hear an announcement.

## Alternatives considered

- **HTML drag and drop as the main interaction:** no keyboard support at all, and poor touch support. Fine as an enhancement over the button model.
- **Listboxes with `aria-activedescendant`:** more complex to get right across screen readers than plain buttons, for no gain in these layouts.
- **`disabled` for used items:** simpler, but measured to strand keyboard users.
- **Timed exercises by default:** they exclude learners who need more time, against 2.2.1.

## Consequences

- Every exercise type ships with its keyboard model, announcements, catalogue messages and tests, which makes new types slower to add but complete.
- Learners can use the whole SDK with a keyboard, a switch, a screen reader or a single finger.
- **Untested:** Safari on macOS skips buttons when tabbing unless "Press Tab to highlight each item" is on; Option+Tab reaches them. We don't override platform settings, and the prototypes ran in Playwright's WebKit on Linux, so this platform behaviour is to be confirmed in the screen-reader pass.
