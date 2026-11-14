import type { Announce } from "@hussmartinez/ui/react";
import type { ComponentType } from "react";
import type { Exercise, Grade } from "../../core/model/content.js";
import type { LanguageProfile } from "../../core/model/language-profile.js";
import type { LearnPlayerMessages } from "./player-messages.js";

/**
 * What the player gives an exercise type's block (ADR 0001, ADR 0005).
 *
 * @typeParam Payload - The type's validated payload.
 * @typeParam Answer - The type's answer.
 * @public
 */
export interface PlayerBlockProps<Payload = unknown, Answer = unknown> {
  /** The exercise, with its payload as its type validated it. */
  readonly exercise: Exercise<Payload>;
  /** The learner's answer so far, or `undefined`. */
  readonly answer: Answer | undefined;
  /** Replaces the answer. Only called while the exercise isn't checked. */
  readonly onAnswer: (answer: Answer) => void;
  /** The grade once checked, when the block shows each item right or wrong and takes no input. */
  readonly grade: Grade | null;
  /** The learned language: its text takes the profile's `lang` and `dir`. */
  readonly profile: LanguageProfile;
  readonly messages: LearnPlayerMessages;
  /** Says something in the player's polite live region. */
  readonly announce: Announce;
}

/**
 * A React component that shows one exercise type in the player, and builds
 * its answers.
 *
 * @public
 */
export type PlayerBlock = ComponentType<PlayerBlockProps>;

/**
 * Types a block for its exercise type's payload and answer, as the player
 * takes it.
 *
 * @example
 * ```tsx
 * const FlashcardsPlayer = definePlayerBlock<FlashcardsPayload, FlashcardsAnswer>((props) => …);
 * <LearnPlayer content={content} types={types} blocks={{ flashcards: FlashcardsPlayer }} />
 * ```
 *
 * @public
 */
export function definePlayerBlock<Payload, Answer>(
  block: ComponentType<PlayerBlockProps<Payload, Answer>>,
): PlayerBlock {
  return block as PlayerBlock;
}
