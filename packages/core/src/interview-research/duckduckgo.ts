import * as cheerio from 'cheerio';
import { BROWSER_USER_AGENT, Fetcher } from '../retrieval/fetcher.js';
import { SearchUnavailableError } from './search-provider.js';
import type { SearchProvider, SearchResult } from './types.js';

/**
 * Parse DuckDuckGo's HTML results page into structured results. DDG wraps target
 * URLs in a redirect carrying the real URL in the `uddg` query param, which we
 * decode. Exported so it can be tested against canned HTML (no network).
 */
export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  $('a.result__a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let url = href;
    try {
      const u = new URL(href, 'https://duckduckgo.com');
      const uddg = u.searchParams.get('uddg');
      if (uddg) url = uddg;
    } catch {
      /* keep raw href */
    }
    results.push({ url, title: $(el).text().replace(/\s+/g, ' ').trim() });
  });
  return results;
}

/** DDG serves a bot-challenge page (HTTP 202) when it rate-limits/blocks a client. */
function isChallengePage(status: number, body: string): boolean {
  return status === 202 || /\banomaly\b|challenge-form|If this error persists/i.test(body);
}

/**
 * Free, keyless search via DuckDuckGo's HTML endpoint. Uses a browser User-Agent
 * because DDG blocks non-browser bots with a 202 challenge page. Distinguishes
 * three outcomes:
 *   - blocked/unavailable → throws SearchUnavailableError (reported explicitly)
 *   - reachable but no results → returns []
 *   - results → parsed list
 * It never fabricates results or falls back to a hardcoded list.
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  constructor(private readonly fetcher: Fetcher = new Fetcher({ userAgent: BROWSER_USER_AGENT })) {}

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await this.fetcher.fetch(url);
    if (!res.ok) {
      throw new SearchUnavailableError(`DuckDuckGo request failed: ${res.reason}`);
    }
    if (isChallengePage(res.status, res.body)) {
      throw new SearchUnavailableError(
        `DuckDuckGo returned a challenge/anomaly page (HTTP ${res.status}) — the endpoint is rate-limiting or blocking this environment`,
      );
    }
    return parseDuckDuckGoHtml(res.body)
      .slice(0, limit)
      .map((r) => ({ ...r, provider: 'duckduckgo' }));
  }
}
