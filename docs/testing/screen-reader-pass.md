# Screen-reader pass

[ADR 0005](../adr/0005-accessible-exercise-types.md) asks for a manual pass with screen readers before the first release that ships the player's components, and again for each new exercise type. No automated test can hear an announcement, so this is a script for a person to follow. Record the result in the release's pull request: the screen reader, browser and operating system with their versions, and anything that didn't match.

## Setting up

Build the package and the examples, then serve the Vite example:

```sh
pnpm install
pnpm build
pnpm build:examples
pnpm --filter @hussmartinez/learn-sdk-example-vite start
```

Open <http://localhost:4340/>. The Next.js example, served with `pnpm --filter @hussmartinez/learn-sdk-example-next start` at <http://localhost:4341/>, shows the same player rendered on the server. Check it once too, from the top of the page.

Use the keyboard only, and leave the mouse and trackpad alone. Run the pass with at least:

- **VoiceOver** on macOS with Safari: turn it on with ⌘F5, and use Tab and the arrow keys as below, not the VoiceOver cursor (VO with arrow keys), except where a step says to read.
- **NVDA** on Windows with Firefox or Chrome: in focus mode, which NVDA switches to by itself in a group of buttons or a text field. Insert+Space toggles it if it doesn't.

Have a Thai voice installed, so you can tell whether Thai text is read as Thai. On macOS, add one in System Settings › Accessibility › Spoken Content › System voice › Manage voices. NVDA uses the voices Windows has installed.

Wording varies between screen readers: "pressed", "selected" or "toggle button, on" all mean the same. What matters is that the meaning in the right-hand column comes across.

## Every exercise

| Do | Expect to hear |
|---|---|
| Tab from the top of the page into the player | The region "Exercises", then the first choice of the first question. Focus never lands on anything you can't see. |
| Read the heading, the position and the instructions (VO with arrow keys, or NVDA's arrow keys in browse mode) | "Food words", heading level 2; "Exercise 1 of 3"; "Choose what each word means." |
| Tab to the toolbar | The toolbar "Exercise actions". Previous and Check are announced as dimmed or unavailable, but you can still focus them. |
| Focus Check | Its shortcut is announced, such as "Control+Enter" or "Command+Enter", along with its name. |

## Multiple choice ("Food words")

| Do | Expect to hear |
|---|---|
| Tab to the first question's choices | The group "Choices for question 1", with the prompt กิน read **in Thai**, then "to eat, toggle button, not pressed". |
| Press → and ←, then Home and End | Each choice in turn, and focus stays inside the group. One Tab leaves the group. |
| Press Enter on "to eat" | "pressed" or "selected". |
| Tab to the second question, choose "rice" with Space | "Choices for question 2", น้ำ in Thai, then "rice, pressed". |
| Press Control+Enter (⌘Enter on a Mac) | Without moving focus: "1 of 2 right". Focus stays on "rice". |
| Read on through the questions | "Correct", with the explanation; "Not quite. Right answer: water". The choices are now dimmed or unavailable, and still focusable. |
| Tab to Next and press Enter | Focus moves to the heading "At the market", which is read. |

## Gap fill ("At the market")

| Do | Expect to hear |
|---|---|
| Tab | The text field "Gap 1". |
| Type กิน | Your typing echoed; Thai input works. Control+Enter does nothing while you're typing in the field. |
| Tab | The group "Choices for gap 2", first choice กิน, not pressed. |
| Press →, then Enter on ดื่ม | "ดื่ม, pressed". |
| Press Control+Enter | "Correct". |
| Read on | Each gap says "Correct". The field is now read-only. |

## Word order ("First sentences")

| Do | Expect to hear |
|---|---|
| Tab after moving to the exercise | The hint "Choose the words in order. To move a chosen word, press Alt with an arrow key." when you read it, then the group "Words for sentence 1", and the first word in Thai. The words aren't in the right order. |
| Press Enter on กิน | "กิน placed, 1 of 3". The word stays in the bank, now dimmed, and focus stays on it. |
| Place ฉัน, then ข้าว | "ฉัน placed, 2 of 3", "ข้าว placed, 3 of 3". |
| Shift+Tab to "Your sentence 1", on กิน, and press Alt+→ | "กิน moved to 2 of 3", with focus following the word. |
| Press Enter on a placed word | "… returned to the words", with focus on that word in the bank, available again. Place it again before checking. |
| Press Control+Enter | "Correct", then the summary "Finished: 5 of 5 right." if every exercise was right. |

## Afterwards

| Do | Expect to hear |
|---|---|
| Tab to "Try again" and press Enter | The exercise can be answered again, and nothing is announced as checked. |
| Reload, skip an exercise with the toolbar's Skip, and finish the others | "Skipped" for that exercise, and a summary that says how many were skipped. |
| Check the Next.js example once, from the top of the page | The same as above. Nothing is read twice, and nothing is read before the page settles. |

## Recording the result

Note in the release's pull request:

- the screen reader, browser and operating system, with versions;
- for each block, "as expected", or what you heard instead;
- anything confusing, even if it matched this script.

A mismatch is a bug in the player or in this script. Open an issue, and fix it before the release.
