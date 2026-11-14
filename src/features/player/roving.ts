import { type KeyboardEvent, useCallback, useRef, useState } from "react";

/**
 * A group of buttons with one Tab stop (ADR 0005): the item focused last
 * keeps `tabIndex` 0, the others -1. ←/→ and ↑/↓ move within the group,
 * Home and End go to its ends; the buttons themselves handle Enter and
 * Space.
 */
export interface RovingGroup {
  /** The props for the item at `index`, to spread on its button. */
  item(index: number): {
    readonly tabIndex: 0 | -1;
    readonly ref: (element: HTMLButtonElement | null) => void;
    readonly onFocus: () => void;
    readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  };
}

const STEPS: Readonly<Record<string, -1 | 1>> = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

/**
 * Manages a group's roving `tabindex`. Items that can't be chosen any more
 * stay in it, focusable, with `aria-disabled` (ADR 0005).
 *
 * @param count - How many items the group has.
 * @param onKey - Handles a key first, such as Alt with an arrow to move a
 *   tile, and returns `true` when it did.
 */
export function useRovingGroup(
  count: number,
  onKey?: (event: KeyboardEvent<HTMLButtonElement>, index: number) => boolean,
): RovingGroup {
  const [active, setActive] = useState(0);
  const elements = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.min(active, Math.max(0, count - 1));

  const item = useCallback(
    (index: number) => ({
      tabIndex: index === current ? (0 as const) : (-1 as const),
      ref: (element: HTMLButtonElement | null) => {
        elements.current[index] = element;
      },
      onFocus: () => setActive(index),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (onKey?.(event, index)) {
          event.preventDefault();
          return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }
        const step = STEPS[event.key];
        const target =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : step === undefined
                ? null
                : index + step;
        if (target === null || target < 0 || target >= count) {
          return;
        }
        event.preventDefault();
        setActive(target);
        elements.current[target]?.focus();
      },
    }),
    [current, count, onKey],
  );
  return { item };
}

/** Joins class names, leaving out empty ones. */
export const classes = (...names: (string | false | null | undefined)[]): string =>
  names.filter(Boolean).join(" ");
