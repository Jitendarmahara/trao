import { BingSearchProvider } from './bing.js';
import { DuckDuckGoSearchProvider } from './duckduckgo.js';
import { HackerNewsSearchProvider } from './hackernews.js';
import { CompositeSearchProvider } from './search-provider.js';
import type { SearchProvider } from './types.js';

/**
 * The default free, keyless search stack, tried in order of reliability:
 *   1. Hacker News (Algolia JSON API) — stable, not IP-throttled
 *   2. Bing (HTML) — works with a browser UA when not rate-limited
 *   3. DuckDuckGo (HTML) — last resort; often bot-challenged
 * Swappable: any single provider, or a different composite, can be injected.
 */
export function createDefaultSearchProvider(): SearchProvider {
  return new CompositeSearchProvider([
    new HackerNewsSearchProvider(),
    new BingSearchProvider(),
    new DuckDuckGoSearchProvider(),
  ]);
}
