import { SearchUnavailableError } from './search-provider.js';
import type { SearchProvider, SearchResult } from './types.js';
import type { FetchFn } from '../shared/http.js';

const defaultFetch: FetchFn = (url, init) => fetch(url, init);

interface AlgoliaHit {
  title?: string;
  url?: string | null;
  objectID?: string;
}

/**
 * Parse a Hacker News Algolia response into results. Each story yields its
 * external article URL (when present) and its HN discussion page, so both the
 * write-up and the comment thread can be read. Exported for deterministic tests.
 */
export function parseAlgolia(json: unknown): SearchResult[] {
  const hits = (json as { hits?: AlgoliaHit[] } | null)?.hits ?? [];
  const results: SearchResult[] = [];
  for (const h of hits) {
    const title = (h.title ?? '').trim();
    if (h.url) results.push({ url: h.url, title });
    if (h.objectID) {
      results.push({ url: `https://news.ycombinator.com/item?id=${h.objectID}`, title });
    }
  }
  return results;
}

/**
 * Search public interview discussion via the Hacker News Algolia API — a
 * genuinely free, keyless JSON API that (unlike HTML search scrapers) is stable
 * and not IP-throttled in typical runtimes. Throws SearchUnavailableError when
 * the API is unreachable so the stage reports it honestly.
 */
export class HackerNewsSearchProvider implements SearchProvider {
  constructor(private readonly fetchFn: FetchFn = defaultFetch) {}

  async search(query: string, limit = 6): Promise<SearchResult[]> {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { 'user-agent': 'InterviewPrepKit/0.1', accept: 'application/json' },
      });
    } catch (err) {
      throw new SearchUnavailableError(
        `Hacker News search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!res.ok) {
      throw new SearchUnavailableError(`Hacker News search returned HTTP ${res.status}`);
    }
    const json: unknown = await res.json().catch(() => ({}));
    return parseAlgolia(json).slice(0, limit * 2);
  }
}
