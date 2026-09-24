import * as cheerio from 'cheerio';
import { BROWSER_USER_AGENT } from '../retrieval/fetcher.js';
import { SearchUnavailableError } from './search-provider.js';
import type { SearchProvider, SearchResult } from './types.js';
import type { FetchFn } from '../shared/http.js';

const defaultFetch: FetchFn = (url, init) => fetch(url, init);

/**
 * Bing wraps result URLs in a `bing.com/ck/a?...&u=a1<base64url>` redirect. The
 * real URL is the base64url after the `a1` marker. Exported for tests.
 */
export function decodeBingUrl(href: string): string {
  try {
    const u = new URL(href, 'https://www.bing.com');
    if (u.pathname.includes('/ck/a')) {
      const raw = u.searchParams.get('u');
      if (raw && raw.startsWith('a1')) {
        return Buffer.from(raw.slice(2), 'base64url').toString('utf8');
      }
    }
    return u.href;
  } catch {
    return href;
  }
}

/** Parse Bing's organic results (`li.b_algo`) into decoded result URLs. */
export function parseBingHtml(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  $('li.b_algo h2 a[href]').each((_, el) => {
    const url = decodeBingUrl($(el).attr('href') ?? '');
    if (/^https?:/.test(url) && !/(^https?:\/\/)?(www\.)?(bing|microsoft)\.com|go\.microsoft/.test(url)) {
      results.push({ url, title: $(el).text().replace(/\s+/g, ' ').trim() });
    }
  });
  return results;
}

/**
 * Keyless Bing HTML search. Uses a browser User-Agent (Bing blocks bots) and
 * decodes its redirect links. Throws SearchUnavailableError when Bing is
 * unreachable or returns no organic results (typically a rate-limit), so a
 * composite provider can fall through and the stage can report it honestly.
 */
export class BingSearchProvider implements SearchProvider {
  constructor(private readonly fetchFn: FetchFn = defaultFetch) {}

  async search(query: string, limit = 6): Promise<SearchResult[]> {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { 'user-agent': BROWSER_USER_AGENT, accept: 'text/html' },
      });
    } catch (err) {
      throw new SearchUnavailableError(
        `Bing search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) throw new SearchUnavailableError(`Bing search returned HTTP ${res.status}`);
    const results = parseBingHtml(await res.text());
    if (results.length === 0) {
      throw new SearchUnavailableError('Bing returned no organic results (possibly rate-limited)');
    }
    return results.slice(0, limit);
  }
}
