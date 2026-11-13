import { afterEach } from "vitest";
import { progressStoreContract } from "../../../test/contracts/progress-store.contract.js";
import { createLocalProgressStore } from "./local-progress.js";

// The same contract against the browser's real localStorage, in every engine.
afterEach(() => {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("hm-learn:")) {
      localStorage.removeItem(key);
    }
  }
});

progressStoreContract("createLocalProgressStore with localStorage", () =>
  createLocalProgressStore({ namespace: `browser-${Math.random().toString(36).slice(2)}` }),
);
