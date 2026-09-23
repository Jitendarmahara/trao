import type { FetchFn } from './types.js';

export const USER_AGENT = 'InterviewPrepKitBot/0.1 (+https://interview-prep-kit.example/bot)';

export type FetchResult =
  | { ok: true; status: number; url: string; contentType: string; body: string }
  | { ok: false; status: number; url: string; reason: string };

export interface FetcherOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
  maxBytes?: number;
  allowedContentTypes?: string[];
}

const defaultFetch: FetchFn = (url, init) => fetch(url, init);

/**
 * Safe HTTP GET for untrusted pages: enforces a timeout, a content-type
 * allowlist and a size cap (§11 — restrict handling to expected content types
 * and sizes). Never throws for network problems — returns a recorded failure.
 */
export class Fetcher {
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly allowed: string[];

  constructor(options: FetcherOptions = {}) {
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxBytes = options.maxBytes ?? 2_000_000;
    this.allowed = options.allowedContentTypes ?? [
      'text/html',
      'application/xhtml+xml',
      'text/plain',
    ];
  }

  async fetch(url: string): Promise<FetchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        },
      });

      if (!res.ok) {
        return { ok: false, status: res.status, url, reason: `HTTP ${res.status}` };
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!this.allowed.some((t) => contentType.includes(t))) {
        return {
          ok: false,
          status: res.status,
          url,
          reason: `unsupported content-type: ${contentType || 'unknown'}`,
        };
      }

      const body = await res.text();
      if (Buffer.byteLength(body, 'utf8') > this.maxBytes) {
        return { ok: false, status: res.status, url, reason: 'response too large' };
      }

      return { ok: true, status: res.status, url, contentType, body };
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'AbortError'
          ? 'timeout'
          : err instanceof Error
            ? err.message
            : 'fetch failed';
      return { ok: false, status: 0, url, reason };
    } finally {
      clearTimeout(timer);
    }
  }
}
