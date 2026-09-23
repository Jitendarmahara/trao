import * as cheerio from 'cheerio';
import { Fetcher } from '../retrieval/fetcher.js';
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

/**
 * Free, keyless search via DuckDuckGo's HTML endpoint. Best-effort — if it is
 * unreachable or its markup changes, `search` returns [] and the pipeline falls
 * back to an honest "no public interview info" result.
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  constructor(private readonly fetcher: Fetcher = new Fetcher()) {}

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await this.fetcher.fetch(url);
    if (!res.ok) return [];
    return parseDuckDuckGoHtml(res.body).slice(0, limit);
  }
}
