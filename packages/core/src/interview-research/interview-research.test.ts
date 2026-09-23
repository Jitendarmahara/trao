import { describe, it, expect } from 'vitest';
import { parseDuckDuckGoHtml } from './duckduckgo.js';
import { StaticSearchProvider } from './search-provider.js';
import { researchInterviewProcess } from './interview-research.js';
import type { LlmClient } from '../llm/index.js';
import type { FetchFn } from '../shared/http.js';

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
