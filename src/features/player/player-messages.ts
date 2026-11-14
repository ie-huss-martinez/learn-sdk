import {
  defineMessages,
  type MessageOverrides,
  type Messages,
  plural,
} from "@hussmartinez/sdk-core";
import { uiMessages } from "@hussmartinez/ui";
import { learnMessages } from "../../messages/en.js";

/**
 * The player's own text, in English: what the server-safe entry never shows,
 * so it isn't in `learnMessages`.
 */
const playerText = /* @__PURE__ */ defineMessages({
  "player.label": "Exercises",
  "player.position": "Exercise {position, number} of {count, number}",
  "player.toolbar": "Exercise actions",
  "player.withKeys": "{label} ({keys})",
  "player.correct": "Correct",
  "player.incorrect": "Not quite",
  "player.skipped": "Skipped",
  "player.result": "{score, number} of {max, number} right",
  "player.summary": "Finished: {score, number} of {max, number} right.",
  "player.summarySkipped": /* @__PURE__ */ plural("count", {
    one: "You skipped {count} exercise.",
    other: "You skipped {count, number} exercises.",
  }),
  "player.unsupported": "This exercise can't be shown here.",
  "player.saveFailed": "Your progress isn't saved yet.",
  "player.retrySave": "Try saving again",
  "multipleChoice.choices": "Choices for question {number, number}",
  "multipleChoice.rightAnswer": "Right answer: {answer}",
  "gapFill.gap": "Gap {number, number}",
  "gapFill.options": "Choices for gap {number, number}",
  "gapFill.rightAnswer": "Right answer: {answer}",
  "wordOrder.answer": "Your sentence {number, number}",
  "wordOrder.bank": "Words for sentence {number, number}",
  "wordOrder.hint":
    "Choose the words in order. To move a chosen word, press Alt with an arrow key.",
  "wordOrder.placed": "{tile} placed, {position, number} of {count, number}",
  "wordOrder.returned": "{tile} returned to the words",
  "wordOrder.moved": "{tile} moved to {position, number} of {count, number}",
  "wordOrder.rightAnswer": "Right answer: {answer}",
});

/**
 * The player's text: the SDK's catalogue, the player's own and ui's, in one
 * object (sdk-core ADR 0046). Pass overrides for any of its keys as the
 * player's `messages`.
 *
 * @public
 */
export const playerCatalogue = { ...learnMessages, ...playerText, ...uiMessages };

/**
 * The player's messages, as blocks receive them.
 *
 * @public
 */
export type LearnPlayerMessages = Messages<typeof playerCatalogue>;

/**
 * A host's text for the player, by message key, checked for unknown keys and
 * placeholders.
 *
 * @public
 */
export type LearnPlayerMessageOverrides = MessageOverrides<typeof playerCatalogue>;
