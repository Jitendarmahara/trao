import type { SearchProvider, SearchResult } from './types.js';

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
