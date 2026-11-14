import { browserInstances } from "@hussmartinez/sdk-config/testing/browser-instances";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const ALL_BROWSERS = ["chromium", "firefox", "webkit"] as const;

// Browser tests run on Chromium locally, and on all three engines in CI or
// with --mode all-browsers (ADR 0015).
export default defineConfig(({ mode }) => {
  const browsers =
    process.env["CI"] || mode === "all-browsers" ? ALL_BROWSERS : (["chromium"] as const);
  return {
    test: {
      projects: [
        {
          test: {
            name: "unit",
            // build.test.ts checks the built package, so it sits next to the
            // Vite config rather than in src/. test/ holds the repository's
            // own checks, such as the CI image.
            include: ["src/**/*.test.{ts,tsx}", "*.test.ts", "test/**/*.test.ts"],
            exclude: ["**/*.browser.test.{ts,tsx}"],
            environment: "node",
          },
        },
        {
          // Every package the browser tests import, optimised once before any
          // test starts, so a later file's new import doesn't make Vite
          // optimise again and reload the page mid-run.
          optimizeDeps: {
            include: [
              "@hussmartinez/sdk-core",
              "@hussmartinez/ui",
              "@hussmartinez/ui/react",
              "axe-core",
              "react",
              "react/jsx-dev-runtime",
              "react-dom/client",
            ],
          },
          test: {
            name: "browser",
            include: ["src/**/*.browser.test.{ts,tsx}", "test/**/*.browser.test.ts"],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              // The same browsers; with HM_BROWSER_DIAGNOSTICS set to a folder,
              // Chromium also records a net log there, for startup failures
              // that leave no reason (sdk-config's browserInstances).
              instances: browserInstances(browsers),
            },
          },
        },
      ],
    },
  };
});
