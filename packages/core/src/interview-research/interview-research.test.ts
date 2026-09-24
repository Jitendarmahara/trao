import { describe, it, expect } from 'vitest';
import { DuckDuckGoSearchProvider, parseDuckDuckGoHtml } from './duckduckgo.js';
import { SearchUnavailableError, StaticSearchProvider } from './search-provider.js';
import { researchInterviewProcess } from './interview-research.js';
import { Fetcher } from '../retrieval/fetcher.js';
import type { LlmClient } from '../llm/index.js';
import type { InterviewResearchDiagnostics, SearchProvider } from './types.js';
import type { FetchFn } from '../shared/http.js';

/** Representative DuckDuckGo HTML results page (real structure: result__a + uddg redirect). */
const SAMPLE_DDG_HTML = `
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.glassdoor.com%2FInterview%2FStripe-Interview-Questions-E671932.htm&amp;rut=abc">Stripe Interview Questions | Glassdoor</a>
  </h2>
  <a class="result__snippet" href="#">Candidates report a take-home then a system design round.</a>
</div>
<div class="result results_links">
  <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.example.com%2Fstripe-interview&amp;rut=xyz">My Stripe interview experience</a></h2>
</div>`;

/** The DDG bot-challenge page (HTTP 202) returned when it blocks a client. */
const DDG_CHALLENGE = '<html><body>If this error persists, please let us know. anomaly detected</body></html>';

const DISCUSSION =
  '<title>My Acme interview</title><body>I did a take-home exercise, then a system design round, and finally some behavioural questions about teamwork.</body>';

function fakePages(pages: Record<string, string>): FetchFn {
  return async (url) =>
    pages[url]
      ? new Response(pages[url], { status: 200, headers: { 'content-type': 'text/html' } })
      : new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
}

/** Minimal stub of the LLM's callJSON — validates + returns a canned object. */
const stubLlm: Pick<LlmClient, 'callJSON'> = {
  callJSON: async (opts) =>
    opts.schema.parse({
      summary: 'Recruiter screen, a take-home, then a system design round.',
      rounds: ['recruiter screen', 'take-home', 'system design'],
    }),
};

describe('parseDuckDuckGoHtml', () => {
  it('decodes the uddg redirect into the real URL', () => {
    const html =
      '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fblog.test%2Facme">Acme interview experience</a>';
    const results = parseDuckDuckGoHtml(html);
    expect(results[0].url).toBe('https://blog.test/acme');
    expect(results[0].title).toContain('Acme');
  });

  it('parses a representative multi-result DDG page (real structure)', () => {
    const results = parseDuckDuckGoHtml(SAMPLE_DDG_HTML);
    expect(results).toHaveLength(2);
    expect(results[0].url).toBe(
      'https://www.glassdoor.com/Interview/Stripe-Interview-Questions-E671932.htm',
    );
    expect(results[0].title).toContain('Glassdoor');
    expect(results[1].url).toBe('https://blog.example.com/stripe-interview');
  });
});

describe('DuckDuckGoSearchProvider', () => {
  it('returns parsed results on a 200 results page', async () => {
    const fetcher = new Fetcher({
      fetchFn: async () =>
        new Response(SAMPLE_DDG_HTML, { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    const results = await new DuckDuckGoSearchProvider(fetcher).search('stripe interview');
    expect(results).toHaveLength(2);
    expect(results[0].url).toContain('glassdoor.com');
  });

  it('throws SearchUnavailableError on a 202 challenge page (blocked, not empty)', async () => {
    const fetcher = new Fetcher({
      fetchFn: async () =>
        new Response(DDG_CHALLENGE, { status: 202, headers: { 'content-type': 'text/html' } }),
    });
    await expect(new DuckDuckGoSearchProvider(fetcher).search('stripe interview')).rejects.toBeInstanceOf(
      SearchUnavailableError,
    );
  });
});

describe('researchInterviewProcess', () => {
  it('returns an honest "not found" when no search provider is configured', async () => {
    const research = await researchInterviewProcess({ name: 'Acme' });
    expect(research.found).toBe(false);
    expect(research.hasTakeHome).toBe(false);
  });

  it('detects process signals deterministically (no LLM needed)', async () => {
    const provider = new StaticSearchProvider([
      { url: 'https://blog.test/acme-interview', title: 'Acme interview' },
    ]);
    const research = await researchInterviewProcess(
      { name: 'Acme' },
      { searchProvider: provider, fetchFn: fakePages({ 'https://blog.test/acme-interview': DISCUSSION }) },
    );
    expect(research.found).toBe(true);
    expect(research.hasTakeHome).toBe(true);
    expect(research.hasSystemDesign).toBe(true);
    expect(research.behaviouralEmphasis).toBe(true);
    expect(research.sources).toContain('https://blog.test/acme-interview');
  });

  it('uses the LLM to write the summary and normalised rounds when available', async () => {
    const provider = new StaticSearchProvider([
      { url: 'https://blog.test/acme-interview', title: 'Acme interview' },
    ]);
    const research = await researchInterviewProcess(
      { name: 'Acme' },
      {
        searchProvider: provider,
        fetchFn: fakePages({ 'https://blog.test/acme-interview': DISCUSSION }),
        llm: stubLlm,
      },
    );
    expect(research.rounds).toContain('take-home');
    expect(research.summary).toMatch(/system design/i);
  });

  it('falls back to "not found" when the discussion pages are unreachable', async () => {
    const provider = new StaticSearchProvider([{ url: 'https://blog.test/x', title: 'x' }]);
    const research = await researchInterviewProcess(
      { name: 'Acme' },
      { searchProvider: provider, fetchFn: async () => new Response('', { status: 500 }) },
    );
    expect(research.found).toBe(false);
  });

  it('blocks a search result that redirects to a private/loopback host', async () => {
    const provider = new StaticSearchProvider([{ url: 'https://pub.test/exp', title: 'exp' }]);
    const fetchFn: FetchFn = async (url) =>
      url === 'https://pub.test/exp'
        ? new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/x' } })
        : new Response(DISCUSSION, { status: 200, headers: { 'content-type': 'text/html' } });
    const research = await researchInterviewProcess(
      { name: 'Acme' },
      { searchProvider: provider, fetchFn },
    );
    expect(research.found).toBe(false); // the only source was blocked, nothing read
  });

  it('reports diagnostics: results returned, usable, rejected reasons, signals', async () => {
    const provider = new StaticSearchProvider([
      { url: 'https://blog.test/exp', title: 'exp' },
      { url: 'https://blocked.test/exp', title: 'blocked' },
    ]);
    const fetchFn: FetchFn = async (url) =>
      url === 'https://blog.test/exp'
        ? new Response(DISCUSSION, { status: 200, headers: { 'content-type': 'text/html' } })
        : new Response('forbidden', { status: 403, headers: { 'content-type': 'text/html' } });

    let diag: InterviewResearchDiagnostics | undefined;
    const research = await researchInterviewProcess(
      { name: 'Acme' },
      { searchProvider: provider, fetchFn, onDiagnostics: (d) => (diag = d) },
    );

    expect(research.found).toBe(true);
    expect(diag?.search_results_returned).toBe(2);
    expect(diag?.usable_search_results).toBe(1);
    expect(diag?.fetched_sources).toEqual(['https://blog.test/exp']);
    expect(diag?.rejected_sources.some((r) => r.url === 'https://blocked.test/exp' && /403/.test(r.reason))).toBe(true);
    expect(diag?.search_error).toBeNull();
    expect(diag?.signals_detected.hasSystemDesign).toBe(true);
  });

  it('records search_error when the search backend is blocked/unavailable', async () => {
    const blocked: SearchProvider = {
      search: async () => {
        throw new SearchUnavailableError('DuckDuckGo returned a challenge/anomaly page (HTTP 202)');
      },
    };
    let diag: InterviewResearchDiagnostics | undefined;
    const research = await researchInterviewProcess(
      { name: 'Acme' },
      { searchProvider: blocked, onDiagnostics: (d) => (diag = d) },
    );
    expect(research.found).toBe(false);
    expect(diag?.search_error).toMatch(/challenge|anomaly/i);
  });

  it('does not invent signals when the discussion is unrelated', async () => {
    const provider = new StaticSearchProvider([{ url: 'https://blog.test/chat', title: 'chat' }]);
    const bland = '<title>Chat</title><body>I had a friendly conversation about my background at Acme.</body>';
    const research = await researchInterviewProcess(
      { name: 'Acme' },
      { searchProvider: provider, fetchFn: fakePages({ 'https://blog.test/chat': bland }) },
    );
    expect(research.found).toBe(true);
    expect(research.hasTakeHome).toBe(false);
    expect(research.hasSystemDesign).toBe(false);
    expect(research.behaviouralEmphasis).toBe(false);
  });
});
