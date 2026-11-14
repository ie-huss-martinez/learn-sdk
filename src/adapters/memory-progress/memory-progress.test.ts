import { describe, it } from "vitest";
import { defineProgressStoreContract } from "../../testing/progress-store-contract.js";
import { createMemoryProgressStore } from "./memory-progress.js";

defineProgressStoreContract("createMemoryProgressStore", createMemoryProgressStore, {
  describe,
  it,
});
