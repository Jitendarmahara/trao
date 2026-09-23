import type { SleepFn } from './types.js';

export interface RateLimiterOptions {
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  /** Injectable clock (ms). Defaults to Date.now. */
  now?: () => number;
  /** Injectable sleep. Defaults to real setTimeout. */
  sleep?: SleepFn;
}

interface UsageEvent {
  time: number;
  tokens: number;
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sliding-window limiter over the last 60 seconds, capping BOTH requests and
 * tokens per minute — because free tiers limit tokens per minute, not just
 * request count (the brief's warning). `acquire` blocks until there is room.
 */
export class RateLimiter {
  private readonly windowMs = 60_000;
  private readonly maxRequests: number;
  private readonly maxTokens: number;
  private readonly now: () => number;
  private readonly sleep: SleepFn;
  private events: UsageEvent[] = [];

  constructor(options: RateLimiterOptions) {
    this.maxRequests = Math.max(1, options.maxRequestsPerMinute);
    this.maxTokens = Math.max(1, options.maxTokensPerMinute);
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private prune(current: number): void {
    const cutoff = current - this.windowMs;
    this.events = this.events.filter((e) => e.time > cutoff);
  }

  /** Reserve capacity for one request of ~`tokens`, waiting if necessary. */
  async acquire(tokens: number): Promise<void> {
    // Clamp so a single oversized request can never deadlock the window.
    const wanted = Math.min(Math.max(0, tokens), this.maxTokens);

    for (;;) {
      const current = this.now();
      this.prune(current);

      const usedTokens = this.events.reduce((sum, e) => sum + e.tokens, 0);
      const usedRequests = this.events.length;

      if (usedRequests + 1 <= this.maxRequests && usedTokens + wanted <= this.maxTokens) {
        this.events.push({ time: current, tokens: wanted });
        return;
      }

      // Wait until the oldest event ages out of the window, then re-check.
      const oldest = this.events[0];
      const waitMs = oldest ? oldest.time + this.windowMs - current : 1;
      await this.sleep(Math.max(waitMs, 1));
    }
  }
}
