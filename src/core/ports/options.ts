/**
 * Options every port call accepts.
 *
 * @public
 */
export interface LearnCallOptions {
  /**
   * Cancels the call. It then rejects with a `LearnError` whose code is
   * `ABORTED`, `TIMEOUT`, or the code of an `SdkError` given as the abort
   * reason.
   */
  readonly signal?: AbortSignal;
}
