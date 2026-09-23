import type { SleepFn } from './types.js';

export interface BackoffOptions {
  /** Max retries after the first attempt. Default 5. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: SleepFn;
  /** Injectable RNG for jitter (0..1). Default Math.random. */
  random?: () => number;
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** If the error carries a provider-requested wait (Retry-After), honour it. */
function getRetryAfterMs(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'retryAfterMs' in err) {
    const v = (err as { retryAfterMs?: unknown }).retryAfterMs;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

/**
 * Run `fn`, retrying with exponential backoff + jitter while `isRetryable` holds.
 * Respects a provider-supplied Retry-After delay when present (so we wait exactly
 * as long as we're told to, rather than guessing).
 */
export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  options: BackoffOptions = {},
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelayMs = 500,
    maxDelayMs = 20_000,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isRetryable(err) || attempt >= maxRetries) throw err;

      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = exponential * 0.25 * random();
      const retryAfter = getRetryAfterMs(err);
      const delay = retryAfter ?? exponential + jitter;

      await sleep(delay);
      attempt++;
    }
  }
}
