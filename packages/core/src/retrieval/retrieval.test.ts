import { describe, it, expect } from 'vitest';
import { checkUrl, isPrivateOrLocalHost } from './url-guard.js';
import { parseRobots } from './robots.js';
import { scoreLink } from './link-scorer.js';
import { extractPage } from './html.js';
import { crawlCompany } from './crawler.js';
import { Fetcher } from './fetcher.js';
import type { FetchFn } from './types.js';

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}
function html(body: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...extraHeaders } });
}

// ── A fake company site served from an in-memory map (no network) ──
const SITE: Record<string, { status?: number; contentType?: string; body?: string }> = {
  'http://acme.test/': {
    body: `<html><head><title>Acme</title></head><body>
      <h1>Acme builds payment APIs</h1>
      <nav>
        <a href="/about">About the company</a>
        <a href="/company/join-the-team">Join the Team</a>
        <a href="/careers-old">Careers</a>
        <a href="/private-jobs">Private Jobs</a>
        <a href="/blog">Engineering Blog</a>
        <a href="https://external.test/careers">External Careers</a>
        <a href="/">Home</a>
      </nav>
    </body></html>`,
  },
  'http://acme.test/robots.txt': {
    contentType: 'text/plain',
    body: 'User-agent: *\nDisallow: /private-jobs\n',
  },
  'http://acme.test/about': {
    body: '<html><title>About</title><body>Acme is a fintech company based in Berlin.</body></html>',
  },
  'http://acme.test/company/join-the-team': {
    body: `<html><title>Join the Team</title><body>
      Our interview process: a take-home exercise followed by a system design round.
    </body></html>`,
  },
  'http://acme.test/blog': {
    body: '<html><title>Blog</title><body>Engineering posts about scaling.</body></html>',
  },
  // /careers-old and /private-jobs deliberately have no entry → 404 / robots-blocked
};

function fakeSite(site: typeof SITE): FetchFn {
  return async (url) => {
    const page = site[url] ?? site[url.replace(/\/$/, '')];
    if (!page) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    return new Response(page.body ?? '', {
      status: page.status ?? 200,
      headers: { 'content-type': page.contentType ?? 'text/html' },
    });
  };
}

describe('url-guard (SSRF)', () => {
  it('flags private / loopback hosts', () => {
    expect(isPrivateOrLocalHost('localhost')).toBe(true);
    expect(isPrivateOrLocalHost('127.0.0.1')).toBe(true);
    expect(isPrivateOrLocalHost('10.0.0.5')).toBe(true);
    expect(isPrivateOrLocalHost('192.168.1.1')).toBe(true);
    expect(isPrivateOrLocalHost('acme.test')).toBe(false);
  });

  it('blocks localhost in production but allows it when allowLocal is set', () => {
    expect(checkUrl('http://localhost:8099/acme/').ok).toBe(false);
    expect(checkUrl('http://localhost:8099/acme/', { allowLocal: true }).ok).toBe(true);
  });

  it('rejects invalid URLs and non-http protocols', () => {
    expect(checkUrl('not a url').ok).toBe(false);
    expect(checkUrl('ftp://acme.test').ok).toBe(false);
    expect(checkUrl('https://acme.test').ok).toBe(true);
  });
});

describe('robots parser', () => {
  it('disallows a blocked path and allows others', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private');
    expect(r.isAllowed('/private/thing')).toBe(false);
    expect(r.isAllowed('/about')).toBe(true);
  });

  it('lets a longer Allow override a broader Disallow', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\nAllow: /public');
    expect(r.isAllowed('/public/page')).toBe(true);
    expect(r.isAllowed('/secret')).toBe(false);
  });

  it('treats an empty Disallow as allow-all', () => {
    const r = parseRobots('User-agent: *\nDisallow:');
    expect(r.isAllowed('/anything')).toBe(true);
  });
});

describe('link scorer', () => {
  it('ranks hiring links above context links, and flags them as hiring', () => {
    const careers = scoreLink({ url: 'http://x/careers', text: 'Careers' });
    const about = scoreLink({ url: 'http://x/about', text: 'About us' });
    expect(careers.hiring).toBe(true);
    expect(about.hiring).toBe(false);
    expect(careers.score).toBeGreaterThan(about.score);
  });
});

describe('extractPage', () => {
  it('pulls title, clean text and resolved links', () => {
    const page = extractPage('http://acme.test/', SITE['http://acme.test/'].body!);
    expect(page.title).toBe('Acme');
    expect(page.text).toContain('payment APIs');
    expect(page.links.map((l) => l.url)).toContain('http://acme.test/about');
  });
});

describe('crawlCompany (end to end, offline)', () => {
  it('finds the buried hiring page by ranking, honours robots, and records skips', async () => {
    const research = await crawlCompany('http://acme.test', { fetchFn: fakeSite(SITE) });

    // Found the buried hiring page (path we did not hardcode).
    const hiringUrls = research.hiringPages.map((p) => p.url);
    expect(hiringUrls).toContain('http://acme.test/company/join-the-team');
    // and it captured the interview-process text for later generation.
    expect(research.hiringPages.some((p) => p.text.includes('take-home'))).toBe(true);

    // Homepage captured.
    expect(research.homepage?.url).toBe('http://acme.test/');

    // robots.txt respected — /private-jobs never fetched.
    expect(research.pages_used).not.toContain('http://acme.test/private-jobs');
    expect(research.skipped.some((s) => s.reason.includes('robots'))).toBe(true);

    // Dead link recorded, not fatal.
    expect(research.skipped.some((s) => s.url.includes('/careers-old'))).toBe(true);

    // External domain not crawled.
    expect(research.pages_used.every((u) => u.startsWith('http://acme.test'))).toBe(true);
  });

  it('returns an honest empty result (no throw) when the homepage is unreachable', async () => {
    const research = await crawlCompany('http://acme.test', {
      fetchFn: async () => new Response('down', { status: 500 }),
    });
    expect(research.homepage).toBeUndefined();
    expect(research.hiringPages).toHaveLength(0);
    expect(research.skipped.length).toBeGreaterThan(0);
  });

  it('refuses a private/loopback company URL in production mode', async () => {
    const research = await crawlCompany('http://127.0.0.1/', { fetchFn: fakeSite(SITE) });
    expect(research.pages_used).toHaveLength(0);
    expect(research.skipped[0].reason).toMatch(/private|loopback/);
  });

  it('records a genuine robots.txt failure (5xx), not a plain 404', async () => {
    const site: typeof SITE = {
      'http://acme.test/': { body: '<title>Acme</title>Hello' },
      'http://acme.test/robots.txt': { status: 500, contentType: 'text/plain', body: 'err' },
    };
    const research = await crawlCompany('http://acme.test', { fetchFn: fakeSite(site) });
    expect(research.skipped.some((s) => s.url.endsWith('/robots.txt'))).toBe(true);
  });
});

describe('Fetcher — redirect safety (SSRF)', () => {
  it('blocks a public URL that redirects to a private/loopback address', async () => {
    const fetchFn: FetchFn = async (url) =>
      url === 'http://public.test/' ? redirect('http://127.0.0.1/secret') : html('secret');
    const res = await new Fetcher({ fetchFn }).fetch('http://public.test/');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/private|loopback/);
  });

  it('follows a public → public redirect and returns the final page', async () => {
    const fetchFn: FetchFn = async (url) =>
      url === 'http://a.test/' ? redirect('http://b.test/page') : html('final page');
    const res = await new Fetcher({ fetchFn }).fetch('http://a.test/');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.body).toContain('final page');
      expect(res.url).toBe('http://b.test/page');
    }
  });

  it('bounds an endless redirect chain', async () => {
    let n = 0;
    const fetchFn: FetchFn = async () => redirect(`http://loop.test/${n++}`);
    const res = await new Fetcher({ fetchFn, maxRedirects: 3 }).fetch('http://loop.test/start');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/too many redirects/);
  });

  it('rejects an oversized response by declared Content-Length before reading it', async () => {
    const fetchFn: FetchFn = async () => html('small body', { 'content-length': '99999999' });
    const res = await new Fetcher({ fetchFn, maxBytes: 1000 }).fetch('http://big.test/');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/too large/);
  });
});
