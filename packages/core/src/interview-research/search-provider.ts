import type { SearchProvider, SearchResult } from './types.js';

/**
 * Thrown when the search backend is unavailable/blocked (e.g. a rate-limit or
 * bot-challenge page) — distinct from a successful search that found nothing.
 * This lets the pipeline report "search blocked" honestly instead of "no info".
 */
export class SearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchUnavailableError';
  }
}

/** No search backend configured → always empty (yields an honest "nothing found"). */
export class NullSearchProvider implements SearchProvider {
  async search(): Promise<SearchResult[]> {
    return [];
  }
}

/** Fixed results — used by tests and fixtures. */
export class StaticSearchProvider implements SearchProvider {
  constructor(private readonly results: SearchResult[]) {}
  async search(_query: string, limit = this.results.length): Promise<SearchResult[]> {
    return this.results.slice(0, limit);
  }
}

/**
 * Queries ALL providers and MERGES their results (de-duplicated by URL, order
 * preserved, provider attribution kept). It does NOT stop at the first non-empty
 * provider — that previously hid better, more-accessible sources behind a provider
 * whose top results were blocked in this environment. Only when EVERY provider
 * throws (all unavailable) does it throw SearchUnavailableError; a provider that
 * responds with nothing is an honest empty contribution. Providers stay swappable.
 */
export class CompositeSearchProvider implements SearchProvider {
  constructor(private readonly providers: SearchProvider[]) {}

  async search(query: string, limit?: number): Promise<SearchResult[]> {
    const merged: SearchResult[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        const results = await provider.search(query, limit);
        for (const r of results) {
          if (!seen.has(r.url)) {
            seen.add(r.url);
            merged.push(r);
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (merged.length === 0 && errors.length === this.providers.length && this.providers.length > 0) {
      throw new SearchUnavailableError(`All search providers unavailable: ${errors.join(' | ')}`);
    }
    return merged;
  }
}
