import "@hussmartinez/ui/styles.css";
import "../styles.css";
import { platformOf } from "@hussmartinez/sdk-core";
import axe from "axe-core";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { LearnError } from "../core/errors/learn-error.js";
import type { ProgressChange } from "../core/model/progress.js";
import type { ProgressStore } from "../core/ports/progress-store.js";
import { bankOrder } from "../features/word-order/WordOrderPlayer.js";
import { LearnPlayer, type LearnPlayerHandle } from "./LearnPlayer.js";
import type { LearnPlayerProps } from "./player-context.js";

// The player (ADR 0005): each built-in block completed with the keyboard
// alone, focus that's never lost, results in text and in the live region,
// and axe's WCAG 2.2 AA rules in each state.

const content = {
  format: "hm-learn-content",
  version: 1,
  exercises: [
    {
      id: "mc",
      type: "multiple-choice",
      title: "อาหาร",
      payload: { questions: [{ prompt: "กิน", choices: ["eat", "drink", "sleep"], correct: 0 }] },
    },
    {
      id: "gf",
      type: "gap-fill",
      instructions: "Fill in the gaps.",
      payload: {
        items: [
          { sentence: "ฉัน ___ ข้าว", answers: ["กิน"], translation: "I eat rice." },
          { sentence: "เขา ___ น้ำ", answers: ["ดื่ม"], options: ["กิน", "ดื่ม"] },
        ],
      },
    },
    { id: "wo", type: "word-order", payload: { items: [{ tiles: ["ฉัน", "กิน", "ข้าว"] }] } },
  ],
};
const thai = { code: "th", direction: "ltr" } as const;

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
});

function render(props: Partial<LearnPlayerProps> = {}, ref?: React.Ref<LearnPlayerHandle>) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const element = container;
  act(() => root?.render(<LearnPlayer ref={ref} content={content} profile={thai} {...props} />));
  return element;
}

const mod = platformOf(navigator) === "apple" ? "Meta" : "Control";
const button = (name: string) =>
  [...(container?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent?.trim() === name,
  ) as HTMLButtonElement;
const tool = (label: string) =>
  [...(container?.querySelectorAll(".hm-learn-toolbar button") ?? [])].find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement;
const status = () => container?.querySelector(".hm-announcer [role=status]")?.textContent ?? "";
const text = () => container?.querySelector(".hm-learn-player")?.textContent ?? "";

async function noViolations() {
  const { violations } = await axe.run(container as HTMLElement, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
  });
  expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}

describe("LearnPlayer", () => {
  it("shows the first exercise in the learned language, with nothing to check yet", async () => {
    render();
    expect(container?.querySelector("h2")?.textContent).toBe("อาหาร");
    expect(text()).toContain("Exercise 1 of 3");
    expect(container?.querySelector(".hm-learn-prompt")?.getAttribute("lang")).toBe("th");
    expect(tool("Check")?.getAttribute("aria-disabled")).toBe("true");
    expect(tool("Check")?.getAttribute("aria-keyshortcuts")).toBe(
      `${mod === "Meta" ? "Meta" : "Control"}+Enter`,
    );
    await noViolations();
  });

  it("completes multiple choice with the keyboard, keeping focus and announcing the result", async () => {
    const progress: ProgressChange[] = [];
    render({ onProgress: (change) => progress.push(change) });
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement?.textContent).toBe("eat");
    await userEvent.keyboard("{ArrowRight}{End}{Home}");
    expect(document.activeElement?.textContent).toBe("eat");
    await userEvent.keyboard("{Enter}");
    expect(button("eat").getAttribute("aria-pressed")).toBe("true");
    await noViolations();
    await userEvent.keyboard(`{${mod}>}{Enter}{/${mod}}`);
    await vi.waitFor(() => expect(status()).toBe("Correct"));
    expect(document.activeElement?.textContent).toBe("eat");
    expect(button("drink").getAttribute("aria-disabled")).toBe("true");
    expect(container?.querySelector(".hm-learn-item-result")?.textContent).toContain("Correct");
    expect(progress).toMatchObject([
      { kind: "attempt", exerciseId: "mc", answer: { selected: [0] } },
    ]);
    await noViolations();
  });

  it("fills gaps by typing and by choosing, shows the right answers, and moves focus to the next heading", async () => {
    render();
    await userEvent.click(tool("Next"));
    expect(document.activeElement).toBe(container?.querySelector("h2"));
    expect(text()).toContain("Exercise 2 of 3");
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Gap 1");
    await userEvent.keyboard("กับ{Tab}");
    expect(document.activeElement?.textContent).toBe("กิน");
    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(button("ดื่ม").getAttribute("aria-pressed")).toBe("true");
    await noViolations();
    await userEvent.click(tool("Check"));
    await vi.waitFor(() => expect(status()).toBe("1 of 2 right"));
    expect(text()).toContain("Right answer: กิน");
    expect(container?.querySelector("input")?.readOnly).toBe(true);
    await noViolations();
  });

  it("orders words with the keyboard, moving a placed word with Alt and an arrow", async () => {
    render();
    await userEvent.click(tool("Next"));
    await userEvent.click(tool("Next"));
    const bank = [
      ...(container?.querySelectorAll(".hm-learn-tiles:not(.hm-learn-tiles--placed) button") ?? []),
    ];
    expect(bank.map((tile) => tile.textContent)).not.toEqual(["ฉัน", "กิน", "ข้าว"]);
    // Place the tiles as ข้าว, ฉัน, กิน, then move ข้าว to the end.
    for (const word of ["ข้าว", "ฉัน", "กิน"]) {
      (bank.find((tile) => tile.textContent === word) as HTMLElement).focus();
      await userEvent.keyboard("{Enter}");
    }
    await vi.waitFor(() => expect(status()).toBe("กิน placed, 3 of 3"));
    expect(bank.every((tile) => tile.getAttribute("aria-disabled") === "true")).toBe(true);
    (document.querySelector(".hm-learn-tiles--placed button") as HTMLElement).focus();
    await userEvent.keyboard("{Alt>}{ArrowRight}{ArrowRight}{/Alt}");
    await vi.waitFor(() => expect(status()).toBe("ข้าว moved to 3 of 3"));
    expect(document.activeElement?.textContent).toBe("ข้าว");
    const placed = () =>
      [...(container?.querySelectorAll(".hm-learn-tiles--placed button") ?? [])].map(
        (t) => t.textContent,
      );
    expect(placed()).toEqual(["ฉัน", "กิน", "ข้าว"]);
    await noViolations();
    await userEvent.click(tool("Check"));
    await vi.waitFor(() => expect(status()).toBe("Correct"));
    await noViolations();
  });

  it("returns a placed word to the bank, focusing it there", async () => {
    render();
    await userEvent.click(tool("Next"));
    await userEvent.click(tool("Next"));
    await userEvent.click(button("กิน"));
    const placed = container?.querySelector(".hm-learn-tiles--placed button") as HTMLElement;
    placed.focus();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(status()).toBe("กิน returned to the words"));
    expect(container?.querySelector(".hm-learn-tiles--placed button")).toBeNull();
    expect(document.activeElement?.textContent).toBe("กิน");
    expect(document.activeElement?.getAttribute("aria-disabled")).toBeNull();
  });

  it("sums up once every exercise is checked or skipped, and starts again on retry", async () => {
    render();
    await userEvent.click(button("eat"));
    await userEvent.click(tool("Check"));
    await userEvent.click(tool("Next"));
    await userEvent.click(tool("Skip"));
    await userEvent.click(tool("Next"));
    await userEvent.click(tool("Skip"));
    await vi.waitFor(() => expect(status()).toBe("Finished: 1 of 1 right."));
    expect(text()).toContain("You skipped 2 exercises.");
    await userEvent.click(tool("Try again"));
    expect(container?.querySelector(".hm-learn-summary")).toBeNull();
  });

  it("tells the learner when progress isn't saved, and saves it on request", async () => {
    let fail = true;
    const saved: ProgressChange[] = [];
    const store: ProgressStore = {
      load: async () => ({ attempts: [], cards: [] }),
      save: async (_scope, changes) => {
        if (fail) throw new LearnError("STORAGE_UNAVAILABLE", "Full.");
        saved.push(...changes);
      },
      clear: async () => {},
    };
    const errors: unknown[] = [];
    render({ progressStore: store, scope: "s", onError: (error) => errors.push(error) });
    await userEvent.click(button("eat"));
    await userEvent.click(tool("Check"));
    await vi.waitFor(() => expect(text()).toContain("Your progress isn't saved yet."));
    expect(errors).toHaveLength(1);
    fail = false;
    await userEvent.click(button("Try saving again"));
    await vi.waitFor(() => expect(container?.querySelector(".hm-learn-save-failed")).toBeNull());
    expect(saved).toHaveLength(1);
  });

  it("shows why content can't be opened, instead of the exercises", () => {
    render({ content: { ...content, version: 2 } });
    expect(container?.querySelector("[role=alert]")?.textContent).toMatch(/newer version/);
    expect(container?.querySelector(".hm-learn-toolbar")).toBeNull();
  });

  it("checks, moves on and starts again through its ref", async () => {
    const ref = createRef<LearnPlayerHandle>();
    render({}, ref);
    await userEvent.click(button("drink"));
    act(() => ref.current?.check());
    await vi.waitFor(() => expect(status()).toBe("0 of 1 right"));
    act(() => ref.current?.next());
    expect(text()).toContain("Exercise 2 of 3");
    act(() => ref.current?.reset());
    expect(text()).toContain("Exercise 1 of 3");
    expect(button("drink").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("bankOrder", () => {
  it("shuffles the same way every time, and never into the right order", () => {
    for (let count = 2; count < 12; count++) {
      const order = bankOrder(`exercise:${count}`, count);
      expect(order).toEqual(bankOrder(`exercise:${count}`, count));
      expect([...order].sort((a, b) => a - b)).toEqual([...Array(count).keys()]);
      expect(order).not.toEqual([...Array(count).keys()]);
    }
  });
});
