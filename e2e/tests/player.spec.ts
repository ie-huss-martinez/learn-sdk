import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { targets } from "../targets.js";

/**
 * The player on each built example, as a host serves it (sdk-core ADR 0007,
 * ADR 0012; ADR 0005 in the package): rendered on the server where the
 * framework does, hydrated without a warning, and every exercise type
 * completed with the keyboard alone and with single clicks alone, under a
 * strict Content Security Policy, with no violation, no error, no axe
 * finding and no request to another origin.
 */

interface Problems {
  console: string[];
  errors: string[];
  foreignRequests: string[];
}

function watch(page: Page, origin: string): Problems {
  const problems: Problems = { console: [], errors: [], foreignRequests: [] };
  page.on("console", (message) => {
    // A Content Security Policy violation or a hydration mismatch is reported here.
    if (message.type() === "error" || message.type() === "warning") {
      problems.console.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== origin)
      problems.foreignRequests.push(url.href);
  });
  return problems;
}

/** Waits until React owns the player, so keys and clicks reach it. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const player = document.querySelector(".hm-learn-player");
    return player !== null && Object.keys(player).some((key) => key.startsWith("__react"));
  });
}

async function noViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include(".hm-learn-player")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.help} at ${v.nodes.map((n) => n.target.join(" ")).join("; ")}`,
    ),
  ).toEqual([]);
}

const status = (page: Page) => page.locator(".hm-announcer [role=status]");
const tool = (page: Page, name: string) =>
  page
    .getByRole("toolbar", { name: "Exercise actions" })
    .getByRole("button", { name, exact: true });
const tile = (page: Page, group: string, name: string) =>
  page.getByRole("group", { name: group }).getByRole("button", { name, exact: true });

test.describe("the Next.js example's server rendering", () => {
  test("renders the first exercise on the server, in Thai, under a nonce policy", async ({
    request,
  }) => {
    const response = await request.get("http://localhost:4341/");
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain('aria-label="Exercises"');
    expect(html).toContain("Food words");
    expect(html).toMatch(/<p[^>]*lang="th"[^>]*>กิน<\/p>/);
    expect(html).toContain("Exercise 1 of 3");
    const policy = response.headers()["content-security-policy"] ?? "";
    expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(policy).toContain("style-src 'self'");
  });
});

for (const target of targets) {
  test.describe(target.name, () => {
    test("completes every exercise type with the keyboard alone", async ({ page }) => {
      const problems = watch(page, new URL(target.url).origin);
      await page.goto(target.url);
      await hydrated(page);
      await noViolations(page);

      // Multiple choice: one Tab stop per question, Enter to choose.
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "to eat" })).toBeFocused();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "rice" })).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("button", { name: "water" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await noViolations(page);
      await page.keyboard.press("ControlOrMeta+Enter");
      await expect(status(page)).toHaveText("Correct");
      await expect(page.getByRole("button", { name: "water" })).toBeFocused();
      await noViolations(page);

      // Next, by keyboard: focus moves to the new exercise's heading.
      await tool(page, "Next").focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "At the market" })).toBeFocused();

      // Gap fill: type in the first gap, choose in the second.
      await page.keyboard.press("Tab");
      await expect(page.getByRole("textbox", { name: "Gap 1" })).toBeFocused();
      await page.keyboard.type("กิน");
      await page.keyboard.press("Tab");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(tile(page, "Choices for gap 2", "ดื่ม")).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("ControlOrMeta+Enter");
      await expect(status(page)).toHaveText("Correct");
      await noViolations(page);

      await tool(page, "Next").focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "First sentences" })).toBeFocused();

      // Word order: place กิน, ฉัน, ข้าว, then move กิน one place on with Alt and →.
      for (const word of ["กิน", "ฉัน", "ข้าว"]) {
        await tile(page, "Words for sentence 1", word).focus();
        await page.keyboard.press("Enter");
      }
      await expect(status(page)).toHaveText("ข้าว placed, 3 of 3");
      await tile(page, "Your sentence 1", "กิน").focus();
      await page.keyboard.press("Alt+ArrowRight");
      await expect(status(page)).toHaveText("กิน moved to 2 of 3");
      await expect(tile(page, "Your sentence 1", "กิน")).toBeFocused();
      await noViolations(page);
      await page.keyboard.press("ControlOrMeta+Enter");
      await expect(status(page)).toHaveText("Finished: 5 of 5 right.");
      await expect(page.locator(".hm-learn-summary")).toContainText("Finished: 5 of 5 right.");
      await noViolations(page);

      expect(problems).toEqual({ console: [], errors: [], foreignRequests: [] });
    });

    test("completes every exercise type with single clicks alone", async ({ page }) => {
      const problems = watch(page, new URL(target.url).origin);
      await page.goto(target.url);
      await hydrated(page);

      await page.getByRole("button", { name: "to drink" }).click();
      await page.getByRole("button", { name: "water" }).click();
      await tool(page, "Check").click();
      await expect(page.locator(".hm-learn-result")).toHaveText("1 of 2 right");
      await expect(page.locator(".hm-learn-exercise")).toContainText("Right answer: to eat");
      await tool(page, "Next").click();

      await page.getByRole("textbox", { name: "Gap 1" }).fill("กิน");
      await tile(page, "Choices for gap 2", "ดื่ม").click();
      await tool(page, "Check").click();
      await expect(page.locator(".hm-learn-result")).toHaveText("2 of 2 right");
      await tool(page, "Next").click();

      await tool(page, "Skip").click();
      await expect(page.locator(".hm-learn-summary")).toContainText("Finished: 3 of 4 right.");
      await expect(page.locator(".hm-learn-summary")).toContainText("You skipped 1 exercise.");
      await noViolations(page);

      expect(problems).toEqual({ console: [], errors: [], foreignRequests: [] });
    });
  });
}
