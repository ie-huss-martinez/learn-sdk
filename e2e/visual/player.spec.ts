import { applyVisualVariant, visualVariants } from "@hussmartinez/sdk-config/testing/visual";
import { expect, type Page, test } from "@playwright/test";

/**
 * The player's designed states, as screenshots (sdk-core ADR 0048). Each is
 * captured in light and dark, compact and comfortable, on the built Vite
 * example as a host renders it, with the example's Thai content.
 *
 * | State | What it shows |
 * |---|---|
 * | `start` | The first exercise, multiple choice, before any answer |
 * | `multiple-choice-answered` | A choice made in each question |
 * | `multiple-choice-checked` | One right and one wrong, with the right answer and the explanation |
 * | `gap-fill-answered` | A typed gap and a chosen one |
 * | `gap-fill-checked` | A wrong typed gap and a right chosen one, with the right answer |
 * | `word-order-placing` | Two words placed, the third still in the bank |
 * | `word-order-checked` | The sentence in order, checked |
 * | `summary` | The end, after one exercise was skipped |
 * | `error` | Content of a later format version, and the catalogue's text for it |
 *
 * Nothing is masked: the player shows no time, and nothing it draws depends
 * on timing. Focus is moved off the player before each screenshot, so a
 * focus ring shows only where a state is about focus. The custom element
 * isn't captured: learn-sdk doesn't ship one yet. Saving that fails isn't
 * captured either, because the example has no progress store.
 */

/** A fixed time, so nothing that reads the clock can vary (ADR 0048). */
const NOW = new Date("2026-11-15T12:00:00Z");
const ORIGIN = "http://localhost:4340";

const tool = (page: Page, name: string) =>
  page
    .getByRole("toolbar", { name: "Exercise actions" })
    .getByRole("button", { name, exact: true });
const inGroup = (page: Page, group: string, name: string) =>
  page.getByRole("group", { name: group }).getByRole("button", { name, exact: true });

async function choicesMade(page: Page): Promise<void> {
  await page.getByRole("button", { name: "to eat" }).click();
  await page.getByRole("button", { name: "rice" }).click();
  await expect(page.getByRole("button", { name: "rice" })).toHaveAttribute("aria-pressed", "true");
}

async function atGapFill(page: Page): Promise<void> {
  await tool(page, "Next").click();
  await expect(page.getByRole("heading", { name: "At the market" })).toBeVisible();
}

async function gapsFilled(page: Page, typed: string): Promise<void> {
  await atGapFill(page);
  await page.getByRole("textbox", { name: "Gap 1" }).fill(typed);
  await inGroup(page, "Choices for gap 2", "ดื่ม").click();
}

async function atWordOrder(page: Page): Promise<void> {
  await atGapFill(page);
  await tool(page, "Next").click();
  await expect(page.getByRole("heading", { name: "First sentences" })).toBeVisible();
}

async function place(page: Page, words: readonly string[]): Promise<void> {
  for (const word of words) {
    await inGroup(page, "Words for sentence 1", word).click();
  }
}

const STATES: Readonly<Record<string, (page: Page) => Promise<void>>> = {
  start: async (page) => {
    await expect(page.getByRole("heading", { name: "Food words" })).toBeVisible();
  },
  "multiple-choice-answered": choicesMade,
  "multiple-choice-checked": async (page) => {
    await choicesMade(page);
    await tool(page, "Check").click();
    await expect(page.locator(".hm-learn-result")).toHaveText("1 of 2 right");
  },
  "gap-fill-answered": async (page) => gapsFilled(page, "กิน"),
  "gap-fill-checked": async (page) => {
    await gapsFilled(page, "กับ");
    await tool(page, "Check").click();
    await expect(page.locator(".hm-learn-result")).toHaveText("1 of 2 right");
  },
  "word-order-placing": async (page) => {
    await atWordOrder(page);
    await place(page, ["ฉัน", "กิน"]);
    await expect(
      page.getByRole("group", { name: "Your sentence 1" }).getByRole("button"),
    ).toHaveCount(2);
  },
  "word-order-checked": async (page) => {
    await atWordOrder(page);
    await place(page, ["ฉัน", "กิน", "ข้าว"]);
    await tool(page, "Check").click();
    await expect(page.locator(".hm-learn-result")).toHaveText("1 of 1 right");
  },
  summary: async (page) => {
    await choicesMade(page);
    await tool(page, "Check").click();
    await atGapFill(page);
    await tool(page, "Skip").click();
    await tool(page, "Next").click();
    await place(page, ["ฉัน", "กิน", "ข้าว"]);
    await tool(page, "Check").click();
    await expect(page.locator(".hm-learn-summary")).toBeVisible();
  },
  error: async (page) => {
    // The player's alert, not the announcer's empty assertive region.
    await expect(page.locator(".hm-learn-error")).toContainText("newer version");
  },
};

for (const [state, reach] of Object.entries(STATES)) {
  for (const variant of visualVariants) {
    test(`${state}, ${variant.name}`, async ({ page }) => {
      // No request may leave the page's origin (sdk-core ADR 0012).
      const foreign: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (!["http:", "https:"].includes(url.protocol)) return;
        if (url.origin !== ORIGIN) foreign.push(request.url());
      });
      await page.clock.install({ time: NOW });
      await page.goto(state === "error" ? "/?content=broken" : "/");
      await applyVisualVariant(page, variant);
      await reach(page);
      // Neither focus nor the pointer rests on the player, so no focus ring or hover shows.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`${state}-${variant.name}.png`);
      expect(foreign).toEqual([]);
    });
  }
}
