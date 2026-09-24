import type { FetchFn } from './types.js';
import { checkUrl } from './url-guard.js';

export const USER_AGENT = 'InterviewPrepKitBot/0.1 (+https://interview-prep-kit.example/bot)';

/**
 * A browser-like User-Agent for talking to services (like search engines) that
 * reject non-browser bots. Used ONLY by the research/search path, never by the
 * company-site crawler, which keeps the honest bot UA above.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type FetchResult =
  | { ok: true; status: number; url: string; contentType: string; body: string }
  | { ok: false; status: number; url: string; reason: string };

export interface FetcherOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
  maxBytes?: number;
  allowedContentTypes?: string[];
  /** Allow private/loopback destinations. Must match the crawl's allowLocal. */
  allowLocal?: boolean;
  /** Max redirect hops to follow. Default 5. */
  maxRedirects?: number;
  /** Override the User-Agent (e.g. a browser UA for search engines). */
  userAgent?: string;
}

const defaultFetch: FetchFn = (url, init) => fetch(url, init);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Safe HTTP GET for untrusted pages. Enforces a timeout, a content-type
 * allowlist and a size cap (§11), and — critically — follows redirects MANUALLY,
 * re-running the SSRF guard on every hop so a public URL cannot bounce to a
 * private/loopback address. Never throws for network problems; returns a
 * recorded failure instead.
 */
export class Fetcher {
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly allowed: string[];
  private readonly allowLocal: boolean;
  private readonly maxRedirects: number;
  private readonly userAgent: string;

  constructor(options: FetcherOptions = {}) {
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxBytes = options.maxBytes ?? 2_000_000;
    this.allowed = options.allowedContentTypes ?? [
      'text/html',
      'application/xhtml+xml',
      'text/plain',
    ];
    this.allowLocal = options.allowLocal ?? false;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.userAgent = options.userAgent ?? USER_AGENT;
  }

  async fetch(url: string): Promise<FetchResult> {
    let currentUrl = url;

    for (let redirects = 0; ; redirects++) {
      // SSRF guard on EVERY hop, including redirect destinations.
      const guard = checkUrl(currentUrl, { allowLocal: this.allowLocal });
      if (!guard.ok) return { ok: false, status: 0, url: currentUrl, reason: guard.reason };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchFn(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': this.userAgent,
            accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          },
        });

        // Handle redirects ourselves so each destination is re-validated.
        if (REDIRECT_STATUSES.has(res.status)) {
          const location = res.headers.get('location');
          if (!location) {
            return { ok: false, status: res.status, url: currentUrl, reason: `redirect without Location (${res.status})` };
          }
          if (redirects >= this.maxRedirects) {
            return { ok: false, status: res.status, url: currentUrl, reason: 'too many redirects' };
          }
          let next: URL;
          try {
            next = new URL(location, currentUrl);
          } catch {
            return { ok: false, status: res.status, url: currentUrl, reason: 'invalid redirect location' };
          }
          currentUrl = next.toString();
          continue;
        }

        if (!res.ok) {
          return { ok: false, status: res.status, url: currentUrl, reason: `HTTP ${res.status}` };
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (!this.allowed.some((t) => contentType.includes(t))) {
          return {
            ok: false,
            status: res.status,
            url: currentUrl,
            reason: `unsupported content-type: ${contentType || 'unknown'}`,
          };
        }

        // Reject oversized responses by declared size BEFORE reading the body.
        const declared = Number(res.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > this.maxBytes) {
          return { ok: false, status: res.status, url: currentUrl, reason: 'response too large (declared)' };
        }

        const body = await res.text();
        if (Buffer.byteLength(body, 'utf8') > this.maxBytes) {
          return { ok: false, status: res.status, url: currentUrl, reason: 'response too large' };
        }

        return { ok: true, status: res.status, url: currentUrl, contentType, body };
      } catch (err) {
        const reason =
          err instanceof Error && err.name === 'AbortError'
            ? 'timeout'
            : err instanceof Error
              ? err.message
              : 'fetch failed';
        return { ok: false, status: 0, url: currentUrl, reason };
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
