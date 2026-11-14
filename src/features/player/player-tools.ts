import { defineTool, type Tool } from "@hussmartinez/sdk-core";
import type { LearnPlayer, LearnPlayerSnapshot } from "../../core/session/player.js";

/**
 * What a player tool reads to decide whether it's enabled.
 *
 * @public
 */
export interface LearnPlayerToolState {
  readonly snapshot: LearnPlayerSnapshot;
}

/**
 * What a player tool acts on.
 *
 * @public
 */
export interface LearnPlayerToolContext {
  readonly player: LearnPlayer;
}

/**
 * One of the player's actions as a tool (ADR 0007, sdk-core ADR 0030).
 *
 * @public
 */
export type LearnPlayerTool = Tool<LearnPlayerToolState, LearnPlayerToolContext, undefined>;

/**
 * Checks the current answer. `Mod+Enter`, so Enter stays free for the exercise's own inputs.
 *
 * @public
 */
export const checkTool: LearnPlayerTool = /* @__PURE__ */ defineTool({
  id: "learn.check",
  label: "tools.check",
  icon: "check",
  group: "player",
  isEnabled: ({ snapshot }) => snapshot.can.check,
  run: ({ player }) => {
    player.check();
  },
  shortcuts: ["Mod+Enter"],
});

/**
 * Moves to the next exercise.
 *
 * @public
 */
export const nextTool: LearnPlayerTool = /* @__PURE__ */ defineTool({
  id: "learn.next",
  label: "tools.next",
  icon: "chevron-right",
  group: "player",
  isEnabled: ({ snapshot }) => snapshot.can.next,
  run: ({ player }) => {
    player.next();
  },
});

/**
 * Moves to the previous exercise.
 *
 * @public
 */
export const previousTool: LearnPlayerTool = /* @__PURE__ */ defineTool({
  id: "learn.previous",
  label: "tools.previous",
  icon: "chevron-left",
  group: "player",
  isEnabled: ({ snapshot }) => snapshot.can.previous,
  run: ({ player }) => {
    player.previous();
  },
});

/**
 * Tries a checked or skipped exercise again.
 *
 * @public
 */
export const retryTool: LearnPlayerTool = /* @__PURE__ */ defineTool({
  id: "learn.retry",
  label: "tools.retry",
  icon: "rotate-left",
  group: "player",
  isEnabled: ({ snapshot }) => snapshot.can.retry,
  run: ({ player }) => {
    player.retry();
  },
});

/**
 * Skips the current exercise, which counts as neither right nor wrong.
 *
 * @public
 */
export const skipTool: LearnPlayerTool = /* @__PURE__ */ defineTool({
  id: "learn.skip",
  label: "tools.skip",
  icon: "skip-forward",
  group: "player",
  isEnabled: ({ snapshot }) => snapshot.can.skip,
  run: ({ player }) => {
    player.skip();
  },
});

/**
 * The player's tools, in toolbar order.
 *
 * @public
 */
export const learnPlayerTools: readonly LearnPlayerTool[] = [
  previousTool,
  checkTool,
  retryTool,
  skipTool,
  nextTool,
];
