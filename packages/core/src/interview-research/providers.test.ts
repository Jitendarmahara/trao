import { describe, it, expect } from 'vitest';
import { HackerNewsSearchProvider, parseAlgolia } from './hackernews.js';
import { BingSearchProvider, decodeBingUrl, parseBingHtml } from './bing.js';
import { CompositeSearchProvider, SearchUnavailableError, StaticSearchProvider } from './search-provider.js';
import type { SearchProvider } from './types.js';
import type { FetchFn } from '../shared/http.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

describe('HackerNews (Algolia) provider', () => {
  it('parses hits into article + discussion URLs', () => {
    const results = parseAlgolia({
      hits: [
        { title: 'My Stripe interview', url: 'https://blog.example.com/stripe', objectID: '123' },
        { title: 'Ask HN: prep for Stripe?', url: null, objectID: '456' },
      ],
    });
    expect(results.map((r) => r.url)).toEqual([
      'https://blog.example.com/stripe',
      'https://news.ycombinator.com/item?id=123',
      'https://news.ycombinator.com/item?id=456',
    ]);
  });

  it('returns results from a 200 JSON response', async () => {
    const fetchFn: FetchFn = async () =>
      json({ hits: [{ title: 't', url: 'https://blog.example.com/x', objectID: '1' }] });
    const results = await new HackerNewsSearchProvider(fetchFn).search('stripe interview');
    expect(results[0].url).toBe('https://blog.example.com/x');
  });

  it('throws SearchUnavailableError on a non-200 response', async () => {
    const fetchFn: FetchFn = async () => json({}, 503);
    await expect(new HackerNewsSearchProvider(fetchFn).search('x')).rejects.toBeInstanceOf(
      SearchUnavailableError,
    );
  });
});

describe('Bing provider', () => {
  it('decodes the ck/a base64url redirect into the real URL', () => {
    const target = 'https://blog.example.com/stripe-interview';
    const href = `https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString('base64url')}&ntb=1`;
    expect(decodeBingUrl(href)).toBe(target);
  });

  it('parses organic b_algo results with decoded URLs', () => {
    const target = 'https://www.glassdoor.com/Interview/Stripe.htm';
    const href = `https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString('base64url')}&ntb=1`;
    const results = parseBingHtml(`<li class="b_algo"><h2><a href="${href}">Stripe Interview</a></h2></li>`);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe(target);
  });

  it('throws when Bing returns no organic results (rate-limited)', async () => {
    const fetchFn: FetchFn = async () => html('<html><body>no results</body></html>');
    await expect(new BingSearchProvider(fetchFn).search('x')).rejects.toBeInstanceOf(
      SearchUnavailableError,
    );
  });
});

describe('CompositeSearchProvider', () => {
  const throwing: SearchProvider = {
    search: async () => {
      throw new SearchUnavailableError('down');
    },
  };

  it('MERGES results across all providers (does not stop at the first non-empty)', async () => {
    const composite = new CompositeSearchProvider([
      new StaticSearchProvider([{ url: 'https://a.example.com/x', title: 'a', provider: 'p1' }]),
      new StaticSearchProvider([{ url: 'https://b.example.com/y', title: 'b', provider: 'p2' }]),
    ]);
    const results = await composite.search('q');
    expect(results.map((r) => r.url)).toEqual(['https://a.example.com/x', 'https://b.example.com/y']);
    expect(results.map((r) => r.provider)).toEqual(['p1', 'p2']); // attribution preserved
  });

  it('de-duplicates the same URL returned by multiple providers', async () => {
    const composite = new CompositeSearchProvider([
      new StaticSearchProvider([{ url: 'https://dup.example.com/x', title: 'a' }]),
      new StaticSearchProvider([{ url: 'https://dup.example.com/x', title: 'a again' }]),
    ]);
    expect(await composite.search('q')).toHaveLength(1);
  });

  it('still contributes a working provider even if another throws', async () => {
    const composite = new CompositeSearchProvider([
      throwing,
      new StaticSearchProvider([{ url: 'https://ok.example.com/x', title: 'x' }]),
    ]);
    expect((await composite.search('q')).map((r) => r.url)).toEqual(['https://ok.example.com/x']);
  });

  it('throws only when every provider is unavailable', async () => {
    const composite = new CompositeSearchProvider([throwing, throwing]);
    await expect(composite.search('q')).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  it('returns [] when a provider responds but finds nothing (not unavailable)', async () => {
    const composite = new CompositeSearchProvider([throwing, new StaticSearchProvider([])]);
    expect(await composite.search('q')).toEqual([]);
  });
});
