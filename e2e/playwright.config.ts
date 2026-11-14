import { defineConfig, devices } from "@playwright/test";

const ci = Boolean(process.env["CI"]);

/**
 * End-to-end tests against production builds of the Vite and Next.js
 * examples (sdk-core ADR 0007, ADR 0039): server rendering, hydration, each
 * exercise type completed with the keyboard alone (ADR 0005 in the package),
 * axe, and no request to another origin (sdk-core ADR 0012). Chromium
 * locally, all three engines in CI, as for the other browser tests.
 */
export default defineConfig({
  testDir: "tests",
  forbidOnly: ci,
  retries: 0,
  reporter: ci ? "line" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { trace: "retain-on-failure" },
  projects: (
    [
      ["chromium", "Desktop Chrome"],
      ["firefox", "Desktop Firefox"],
      ["webkit", "Desktop Safari"],
    ] as const
  )
    .filter(([name]) => ci || name === "chromium")
    .map(([name, device]) => ({ name, use: { ...devices[device] } })),
  // Started with Node directly, so the suite also runs in the pinned browser
  // image, which has no pnpm.
  webServer: [
    {
      command: "node node_modules/vite/bin/vite.js preview --port 4340 --strictPort",
      cwd: "../examples/vite",
      url: "http://localhost:4340",
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
    {
      command: "node node_modules/next/dist/bin/next start --port 4341",
      cwd: "../examples/next",
      url: "http://localhost:4341",
      reuseExistingServer: !ci,
      timeout: 60_000,
      env: { NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
