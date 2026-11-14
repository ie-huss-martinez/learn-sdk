"use client";
/**
 * React components of the learn SDK: `LearnPlayer` for learners, with a
 * block per exercise type, and the pieces for a host's own exercise types.
 * `LearnEditor` for teachers follows.
 *
 * @remarks
 * A client entry: it starts with `"use client"`, which the build keeps
 * (ADR 0007). React and React DOM 18.3 or later are optional peer
 * dependencies. Import `@hussmartinez/ui/styles.css` and then
 * `@hussmartinez/learn-sdk/styles.css` once.
 *
 * @packageDocumentation
 */
export { GapFillPlayer } from "./features/gap-fill/GapFillPlayer.js";
export { MultipleChoicePlayer } from "./features/multiple-choice/MultipleChoicePlayer.js";
export type { PlayerBlock, PlayerBlockProps } from "./features/player/player-block.js";
export { definePlayerBlock } from "./features/player/player-block.js";
export type {
  LearnPlayerMessageOverrides,
  LearnPlayerMessages,
} from "./features/player/player-messages.js";
export { playerCatalogue } from "./features/player/player-messages.js";
export { WordOrderPlayer } from "./features/word-order/WordOrderPlayer.js";
export type { LearnPlayerHandle } from "./react/LearnPlayer.js";
export { LearnPlayer } from "./react/LearnPlayer.js";
export type { LearnPlayerProps } from "./react/player-context.js";
