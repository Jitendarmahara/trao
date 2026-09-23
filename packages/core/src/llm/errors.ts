/** Error thrown by the LLM client. Carries HTTP status and whether a retry is sensible. */
export class LlmError extends Error {
  constructor(
    message: string,
    /** HTTP status, when the error came from a response. */
    readonly status?: number,
    /** True for 429/5xx — the caller may retry with backoff. */
    readonly retryable = false,
    /** Delay the provider asked us to wait (from Retry-After), in ms. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/** Retry predicate used by the backoff loop. */
export function isRetryableLlmError(err: unknown): boolean {
  return err instanceof LlmError && err.retryable;
}
