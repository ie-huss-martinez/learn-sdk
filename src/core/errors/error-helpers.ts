import { createErrorHelpers } from "@hussmartinez/sdk-core";
import { LearnError } from "./learn-error.js";

/**
 * The learn SDK's error helpers (sdk-core ADR 0034):
 *
 * - `asLearnError` makes any failure a {@link LearnError}, as every port
 *   promises: a `LearnError` as it is, another `SdkError` with its code and
 *   details, and anything else as `UNKNOWN`, keeping the original as
 *   `cause`;
 * - `abortError` and `throwIfAborted` turn an aborted signal into `ABORTED`
 *   or `TIMEOUT`.
 *
 * @internal
 */
export const {
  adapt: asLearnError,
  abortError,
  throwIfAborted,
} = /* @__PURE__ */ createErrorHelpers(LearnError, {
  fallbackCode: "UNKNOWN",
  fallbackMessage: "The learning content couldn't be processed.",
});
