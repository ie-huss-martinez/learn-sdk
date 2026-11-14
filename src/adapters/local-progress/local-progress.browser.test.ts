import { afterEach, describe, it } from "vitest";
import { defineProgressStoreContract } from "../../testing/progress-store-contract.js";
import { createLocalProgressStore } from "./local-progress.js";

// The same contract against the browser's real localStorage, in every engine.
afterEach(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("hm-learn:")) {
      localStorage.removeItem(key);
    }
  }
});

defineProgressStoreContract(
  "createLocalProgressStore with localStorage",
  () => createLocalProgressStore({ namespace: `browser-${Math.random().toString(36).slice(2)}` }),
  { describe, it },
);
