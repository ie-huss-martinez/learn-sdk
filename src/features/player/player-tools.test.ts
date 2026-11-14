import { describe, expect, it, vi } from "vitest";
import type {
  LearnPlayer,
  LearnPlayerSnapshot,
  PlayerAbilities,
} from "../../core/session/player.js";
import { learnMessages } from "../../messages/en.js";
import { learnPlayerTools } from "./player-tools.js";

const ACTIONS = ["previous", "check", "retry", "skip", "next"] as const;

describe("learnPlayerTools", () => {
  it("has a tool per player action, labelled from the catalogue", () => {
    expect(learnPlayerTools.map((tool) => tool.id)).toEqual(
      ACTIONS.map((action) => `learn.${action}`),
    );
    for (const tool of learnPlayerTools) {
      expect(Object.hasOwn(learnMessages, tool.label), tool.label).toBe(true);
    }
  });

  it("is enabled exactly when the player allows its action, and runs it", () => {
    for (const [index, tool] of learnPlayerTools.entries()) {
      const action = ACTIONS[index] as keyof PlayerAbilities;
      const can = Object.fromEntries(
        ACTIONS.map((name) => [name, name === action]),
      ) as unknown as PlayerAbilities;
      const snapshot = { can } as LearnPlayerSnapshot;
      expect(tool.isEnabled?.({ snapshot })).toBe(true);
      expect(
        tool.isEnabled?.({ snapshot: { can: { ...can, [action]: false } } as LearnPlayerSnapshot }),
      ).toBe(false);
      const player = Object.fromEntries(
        ACTIONS.map((name) => [name, vi.fn()]),
      ) as unknown as LearnPlayer;
      void tool.run({ player });
      expect(player[action]).toHaveBeenCalledOnce();
    }
  });
});
