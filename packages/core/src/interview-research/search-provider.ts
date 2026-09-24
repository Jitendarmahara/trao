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
 * Tries providers in order and returns the first non-empty result set. Only when
 * EVERY provider throws (all unavailable) does it throw SearchUnavailableError;
 * if a provider responds but finds nothing, that is an honest empty result. Keeps
 * the search backend swappable and resilient across a flaky environment.
 */
export class CompositeSearchProvider implements SearchProvider {
  constructor(private readonly providers: SearchProvider[]) {}

  async search(query: string, limit?: number): Promise<SearchResult[]> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        const results = await provider.search(query, limit);
        if (results.length > 0) return results;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (errors.length === this.providers.length && this.providers.length > 0) {
      throw new SearchUnavailableError(`All search providers unavailable: ${errors.join(' | ')}`);
    }
    return [];
  }
}
