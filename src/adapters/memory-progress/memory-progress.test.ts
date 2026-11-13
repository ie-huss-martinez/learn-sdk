import { progressStoreContract } from "../../../test/contracts/progress-store.contract.js";
import { createMemoryProgressStore } from "./memory-progress.js";

progressStoreContract("createMemoryProgressStore", createMemoryProgressStore);
