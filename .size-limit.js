/**
 * Size budgets, of two kinds (sdk-core ADR 0055 and ADR 0056).
 *
 * Entry budgets (`entryBudget`) are ceilings: the brotli size of each built
 * entry with the chunks it loads statically, as built, unminified. They
 * cover everything in an entry, including code no scenario imports.
 *
 * Import budgets (`importBudget`) are what an application ships when it
 * imports part of an entry: bundled and minified with esbuild, without React
 * and the family's packages, compressed with brotli. Each entry whose exports
 * can be used apart has:
 * - a floor, the cheapest import a host would really make, which catches
 *   code that leaks into every import. Its limit is the measurement rounded
 *   up to the next 0.1 kB, and a floor that moves is a leak to fix, never a
 *   budget to raise;
 * - each export over about 2 kB on its own;
 * - what a typical application imports.
 * Other limits are the measurement rounded up to the next 0.5 kB.
 * `pnpm exec hm-size --exports dist/index.js` lists every export's cost.
 *
 * ts-fsrs is a runtime dependency, so the scheduler's scenarios count it,
 * and no other scenario may. ts-fsrs loads its older models (FSRS-3 to
 * FSRS-6) with `import()`, only through its `getSchedulerPreset`, which
 * learn-sdk never calls: the FSRS adapter imports FSRS-7 statically. esbuild
 * drops those models from the bundle already, so no scenario leaves them out,
 * and none has a budget, because no host loads one through learn-sdk.
 *
 * The element entry will mount the whole player (it's empty until the
 * element lands), and the testing entry is for tests, so they keep their
 * ceilings only. This SDK has no worker and no
 * lazy chunks.
 */
import { entryBudget, importBudget } from "@hussmartinez/sdk-config/size";

const core = "dist/index.js";
const react = "dist/react.js";

export default [
  // 17 kB since the React player: the code it shares with the core moved
  // into a shared chunk, which measures about 1.5 kB more than the same code
  // in one file, unminified (15.6 against 14.1 kB).
  entryBudget({ name: "Server-safe core (.)", entry: core, limit: "17 kB" }),
  entryBudget({ name: "React entry (./react)", entry: react, limit: "40 kB" }),
  entryBudget({ name: "Element entry (./element)", entry: "dist/element.js", limit: "40 kB" }),
  entryBudget({
    name: "Contract suites and fakes (./testing)",
    entry: "dist/testing.js",
    limit: "10 kB",
  }),
  {
    name: "Stylesheet (./styles.css)",
    path: "dist/styles.css",
    brotli: true,
    limit: "10 kB",
    disablePlugins: ["@size-limit/esbuild"],
  },

  // The core (.).
  importBudget({
    name: "Core floor: LearnError",
    entry: core,
    imports: "{ LearnError }",
    limit: "0.1 kB",
  }),
  // 3.5, not 3: it measures 2,995 B, which would leave 5 B.
  importBudget({
    name: "Core: parseContent",
    entry: core,
    imports: "{ parseContent }",
    limit: "3.5 kB",
  }),
  importBudget({
    name: "Core: parseProgress",
    entry: core,
    imports: "{ parseProgress }",
    limit: "3.5 kB",
  }),
  importBudget({
    name: "Core: gradeAnswer",
    entry: core,
    imports: "{ gradeAnswer }",
    limit: "3 kB",
  }),
  importBudget({
    name: "Core: multipleChoice",
    entry: core,
    imports: "{ multipleChoice }",
    limit: "2.5 kB",
  }),
  importBudget({ name: "Core: gapFill", entry: core, imports: "{ gapFill }", limit: "2.5 kB" }),
  importBudget({ name: "Core: wordOrder", entry: core, imports: "{ wordOrder }", limit: "2.5 kB" }),
  importBudget({
    name: "Core: applyLearnCommand",
    entry: core,
    imports: "{ applyLearnCommand }",
    limit: "3 kB",
  }),
  importBudget({
    name: "Core: createLocalProgressStore",
    entry: core,
    imports: "{ createLocalProgressStore }",
    limit: "4.5 kB",
  }),
  importBudget({
    name: "Core: createLearnPlayer",
    entry: core,
    imports: "{ createLearnPlayer }",
    limit: "5 kB",
  }),
  importBudget({
    name: "Core: createLearnEditor",
    entry: core,
    imports: "{ createLearnEditor }",
    limit: "5 kB",
  }),
  importBudget({
    name: "Core: createFsrsScheduler, with ts-fsrs",
    entry: core,
    imports: "{ createFsrsScheduler }",
    limit: "13 kB",
  }),
  importBudget({
    name: "Core: grading on a server",
    entry: core,
    imports:
      "{ parseContent, createExerciseTypes, multipleChoice, gapFill, wordOrder, gradeAnswer }",
    limit: "5 kB",
  }),
  importBudget({
    name: "Core: a player app's set",
    entry: core,
    imports:
      "{ createLearnPlayer, createExerciseTypes, multipleChoice, gapFill, wordOrder, createFsrsScheduler, createLocalProgressStore }",
    limit: "20.5 kB",
  }),

  // React (./react).
  importBudget({
    name: "React floor: playerCatalogue",
    entry: react,
    imports: "{ playerCatalogue }",
    limit: "1.8 kB",
  }),
  importBudget({
    name: "React: definePlayerBlock, for a host's own block",
    entry: react,
    imports: "{ definePlayerBlock }",
    limit: "2 kB",
  }),
  importBudget({
    name: "React: MultipleChoicePlayer",
    entry: react,
    imports: "{ MultipleChoicePlayer }",
    limit: "3 kB",
  }),
  importBudget({
    name: "React: GapFillPlayer",
    entry: react,
    imports: "{ GapFillPlayer }",
    limit: "3 kB",
  }),
  importBudget({
    name: "React: WordOrderPlayer",
    entry: react,
    imports: "{ WordOrderPlayer }",
    limit: "3.5 kB",
  }),
  importBudget({
    name: "React: LearnPlayer",
    entry: react,
    imports: "{ LearnPlayer }",
    limit: "10.5 kB",
  }),
];
