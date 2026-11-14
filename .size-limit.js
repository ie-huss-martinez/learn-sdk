/**
 * Size budgets per entry point (ADR 0015): the brotli size of each built
 * entry, with the shared chunks it loads, and only those. They measure the unminified files in
 * dist, an upper bound: applications ship less, because their bundler
 * minifies and drops what they don't import.
 *
 * These are starting ceilings for what each entry should hold. This SDK
 * has no worker. Adapters that bring third-party code, such as the FSRS
 * scheduler, are imported only by hosts that use them, and get their own
 * budgets when they're added. The feature pull requests revisit
 * these against real sizes.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * The built files an entry loads up front: the entry, and every chunk it
 * imports statically, directly or through other chunks. Counting only these,
 * rather than every shared chunk, keeps one entry's budget from paying for
 * code only another entry loads, such as the player's in the testing
 * entry's, as video-sdk measures.
 */
function loadedFiles(file) {
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path) || !existsSync(path)) return;
    seen.add(path);
    const code = readFileSync(path, "utf8");
    for (const [, specifier] of code.matchAll(/(?:from\s*|import\s+)"(\.{1,2}\/[^"]+\.js)"/g)) {
      visit(normalize(join(dirname(path), specifier)));
    }
  };
  visit(join("dist", file));
  return [...seen];
}

const entry = (name, file, limit) => ({
  name: `${name}, with the shared code it loads`,
  path: loadedFiles(file),
  brotli: true,
  limit,
});

export default [
  // 17 kB since the React player: the code it shares with the core moved
  // into a shared chunk, which measures about 1.5 kB more than the same code
  // in one file, unminified (15.6 against 14.1 kB). The core grew by 0.2 kB;
  // the portable formats and the two sessions had taken it from 9.5 to 13.9 kB.
  entry("Server-safe core (.)", "index.js", "17 kB"),
  entry("React entry (./react)", "react.js", "40 kB"),
  entry("Element entry (./element)", "element.js", "40 kB"),
  entry("Contract suites and fakes (./testing)", "testing.js", "10 kB"),
  {
    name: "Stylesheet (./styles.css)",
    path: "dist/styles.css",
    brotli: true,
    limit: "10 kB",
  },
];
