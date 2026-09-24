import { describe, it, expect } from 'vitest';
import { researchInterviewProcess } from './interview-research.js';
import { StaticSearchProvider } from './search-provider.js';
import type { InterviewResearchDiagnostics } from './types.js';
import type { FetchFn } from '../shared/http.js';

type Page = string | { body?: string; status?: number; redirect?: string };
/** Serve a fixed in-memory site; a string is a 200 HTML body, or {redirect} for a 302. */
function site(pages: Record<string, Page>): FetchFn {
  return async (url) => {
    const raw = pages[url] ?? pages[url.replace(/\/$/, '')];
    if (raw === undefined) return new Response('nf', { status: 404, headers: { 'content-type': 'text/plain' } });
    const p = typeof raw === 'string' ? { body: raw } : raw;
    if (p.redirect) return new Response(null, { status: p.status ?? 302, headers: { location: p.redirect } });
    return new Response(p.body ?? '', { status: p.status ?? 200, headers: { 'content-type': 'text/html' } });
  };
}
const EVIDENCE = '<body>My Acme interview: a take-home exercise, then a system design round, plus behavioural questions.</body>';

async function research(fetchFn: FetchFn, seed: string, opts: Record<string, unknown> = {}) {
  let diag: InterviewResearchDiagnostics | undefined;
  const r = await researchInterviewProcess(
    { name: 'Acme' },
    { searchProvider: new StaticSearchProvider([{ url: seed, title: 'seed' }]), fetchFn, onDiagnostics: (d) => (diag = d), ...opts },
  );
  return { r, diag: diag! };
}

describe('interview-research bounded traversal', () => {
  it('THE PROOF: search result → intermediate (no evidence) → deeper interview page → found', async () => {
    const s = site({
      // Intermediate page: mentions the company, but NO interview-process content in
      // its body — only an anchor that links to the real write-up.
      'https://f.test/thread': '<body>Notes about Acme jobs. <a href="/interview-experience">Acme interview experience</a></body>',
      // Deeper page: the actual company-specific interview write-up (real evidence).
      'https://f.test/interview-experience': EVIDENCE,
    });
    const { r, diag } = await research(s, 'https://f.test/thread');

    // the intermediate page WAS fetched
    expect(diag.fetched_urls).toContain('https://f.test/thread');
    // the deeper interview page WAS fetched (followed from the intermediate)
    expect(diag.fetched_urls).toContain('https://f.test/interview-experience');
    expect(diag.followed_links).toContain('https://f.test/interview-experience');
    // the deeper page (not the intermediate) is the evidence source
    expect(diag.evidence_sources).toEqual(['https://f.test/interview-experience']);
    // the deeper page changed the research result
    expect(r.found).toBe(true);
    // signals from the deeper page are detected
    expect(r.hasSystemDesign).toBe(true);
    expect(r.hasTakeHome).toBe(true);
    expect(r.behaviouralEmphasis).toBe(true);
    // the intermediate page is NOT counted as evidence (anchor text is not evidence)
    expect(diag.evidence_sources).not.toContain('https://f.test/thread');
  });

  it('anchor text alone cannot make found=true (deeper page missing → false)', async () => {
    // The intermediate only has an "interview experience" ANCHOR; the linked page 404s.
    const s = site({
      'https://f.test/thread': '<body>Notes about Acme jobs. <a href="/interview-experience">Acme interview experience</a></body>',
      // '/interview-experience' intentionally absent → 404
    });
    const { r, diag } = await research(s, 'https://f.test/thread');
    expect(r.found).toBe(false);
    expect(diag.evidence_sources).toEqual([]);
  });

  it('TEST3: reaches evidence two hops deep', async () => {
    const s = site({
      'https://f.test/a': '<body>Acme jobs. <a href="/b">Acme interview process hub</a></body>',
      'https://f.test/b': '<body>Hub. <a href="/c">Acme interview experience write-up</a></body>',
      'https://f.test/c': EVIDENCE,
    });
    const { r, diag } = await research(s, 'https://f.test/a');
    expect(r.found).toBe(true);
    expect(diag.fetched_urls).toContain('https://f.test/c');
  });

  it('TEST4: stops at maxDepth (evidence beyond depth is not reached)', async () => {
    const s = site({
      'https://f.test/a': '<body>Acme. <a href="/b">Acme interview hub</a></body>',
      'https://f.test/b': '<body>Hub. <a href="/c">Acme interview experience</a></body>',
      'https://f.test/c': EVIDENCE,
    });
    const { r, diag } = await research(s, 'https://f.test/a', { maxDepth: 1 });
    expect(r.found).toBe(false);
    expect(diag.fetched_urls).not.toContain('https://f.test/c');
  });

  it('TEST5: de-duplicates a link discovered multiple times (fetched once)', async () => {
    const s = site({
      'https://f.test/thread':
        '<body>Acme. <a href="/interview-experience">Acme interview experience</a> <a href="/interview-experience">Acme interview experience again</a></body>',
      'https://f.test/interview-experience': EVIDENCE,
    });
    const { diag } = await research(s, 'https://f.test/thread');
    const count = diag.fetched_urls.filter((u) => u === 'https://f.test/interview-experience').length;
    expect(count).toBe(1);
  });

  it('TEST9: a generic guide is rejected but its company-specific link is accepted', async () => {
    const s = site({
      'https://guide.test/sd':
        '<body>A generic system design interview guide with coding rounds. <a href="https://blog.test/acme">Acme interview experience</a></body>',
      'https://blog.test/acme': EVIDENCE,
    });
    const { r, diag } = await research(s, 'https://guide.test/sd');
    expect(r.found).toBe(true);
    expect(diag.evidence_sources).toEqual(['https://blog.test/acme']);
    expect(diag.rejected_sources.some((x) => x.url === 'https://guide.test/sd')).toBe(true);
  });

  it('TEST10: a discovered private/loopback link is blocked (SSRF)', async () => {
    const s = site({
      'https://f.test/thread': '<body>Acme. <a href="http://127.0.0.1/secret">Acme interview experience</a></body>',
    });
    const { r, diag } = await research(s, 'https://f.test/thread');
    expect(r.found).toBe(false);
    expect(diag.fetched_urls).not.toContain('http://127.0.0.1/secret');
    expect(diag.rejected_sources.some((x) => /private|loopback/.test(x.reason))).toBe(true);
  });

  it('TEST11: a discovered link that redirects to a private host is blocked', async () => {
    const s = site({
      'https://f.test/thread': '<body>Acme. <a href="https://redir.test/x">Acme interview experience</a></body>',
      'https://redir.test/x': { redirect: 'http://127.0.0.1/secret' },
    });
    const { r, diag } = await research(s, 'https://f.test/thread');
    expect(r.found).toBe(false);
    expect(diag.rejected_sources.some((x) => x.url === 'https://redir.test/x' && /private|loopback/.test(x.reason))).toBe(true);
  });

  it('TEST16: detects a signal that appears late in a long evidence page', async () => {
    const body = `<body>My Acme interview process. ${'lorem ipsum '.repeat(600)} the final system design round was tough.</body>`;
    const s = site({ 'https://blog.test/acme': body });
    const { r } = await research(s, 'https://blog.test/acme');
    expect(r.found).toBe(true);
    expect(r.hasSystemDesign).toBe(true); // signal beyond the 6k LLM-prompt slice, within evidence text
  });
});
