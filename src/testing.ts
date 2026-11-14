/**
 * Testing tools: the contract suites every adapter of the learn SDK's ports
 * must pass, and fakes for hosts' own tests.
 *
 * @remarks
 * The suites take the test functions (`describe` and `it`) as arguments, so
 * the package doesn't depend on a test framework: Vitest's, Jest's and
 * `node:test`'s all fit. The fakes make no request and store nothing on the
 * device.
 *
 * @example
 * ```ts
 * import { describe, it } from "vitest";
 * import { defineProgressStoreContract } from "@hussmartinez/learn-sdk/testing";
 *
 * defineProgressStoreContract("my server store", () => createServerStore(testDatabase()), { describe, it });
 * ```
 *
 * @packageDocumentation
 */

export { createFakeAudioSource } from "./adapters/fakes/fake-audio-source.js";
export { createFakeScheduler } from "./adapters/fakes/fake-scheduler.js";
export { defineAudioSourceContract } from "./testing/audio-source-contract.js";
export type { ContractTestApi } from "./testing/contract.js";
export { defineProgressStoreContract } from "./testing/progress-store-contract.js";
export { defineSchedulerContract } from "./testing/scheduler-contract.js";
