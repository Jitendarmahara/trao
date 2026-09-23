import { describe, it, expect } from 'vitest';
import { runBatch } from './run-batch.js';
import { validateKit, type LlmClient, type FetchFn } from '@interview-prep-kit/core';

/** Multi-schema stub LLM (role / brief / questions / flashcards). No network. */
function multiStub(candidates: unknown[]): Pick<LlmClient, 'callJSON'> {
  return {
    callJSON: async (opts) => {
      for (const c of candidates) {
        const r = opts.schema.safeParse(c);
        if (r.success) return r.data;
      }
      throw new Error('no canned data matched the schema');
    },
  };
}

const CANNED = [
  {
    title: 'Senior Backend Engineer',
    seniority: 'senior',
    responsibilities: ['Build APIs'],
    requirements: [
      { text: '5+ years with Node', kind: 'technical', priority: 'must' },
      { text: 'Mentoring junior engineers', kind: 'behavioural', priority: 'must' },
    ],
  },
  { summary: 'Acme builds payments infrastructure.', what_they_do: 'A payments API.' },
  { questions: [{ requirement_ids: ['r1', 'r2'], prompt: 'P', answer_outline: 'A', difficulty: 2 }] },
  { flashcards: [{ front: 'Q', back: 'A', requirement_ids: ['r1'] }] },
];

const HOMEPAGE = '<title>Acme</title><h1>Acme builds payment APIs</h1><a href="/about">About</a>';
const site: FetchFn = async (url) => {
  const pages: Record<string, string> = {
    'http://acme.test/': HOMEPAGE,
    'http://acme.test/robots.txt': '',
    'http://acme.test/about': '<title>About</title>Acme is a fintech.',
  };
  const body = pages[url] ?? pages[url.replace(/\/$/, '')];
  const ct = url.endsWith('robots.txt') ? 'text/plain' : 'text/html';
  return body === undefined
    ? new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } })
    : new Response(body, { status: 200, headers: { 'content-type': ct } });
};

describe('runBatch (Appendix B)', () => {
  it('produces Appendix B output, continues past failures, and keys by id', async () => {
    const cases = [
      // Fails on invalid days — must NOT abort the run.
      { id: 'case-bad-days', jd: 'x', company_url: 'http://acme.test', days: 0 },
      // Valid — should still run after the failure above.
      { id: 'case-ok', jd: 'Senior Backend Engineer, Node + mentoring required.', company_url: 'http://acme.test', days: 3 },
      // Malformed case (missing company_url/days) — recorded as failed, not a crash.
      { id: 'case-malformed', jd: 'x' },
    ];

    const seen: string[] = [];
    const out = await runBatch(cases, {
      llm: multiStub(CANNED),
      fetchFn: site,
      onCase: (id) => seen.push(id),
    });

    // Appendix B envelope.
    expect(out.version).toBe('1.0');
    expect(typeof out.generated_at).toBe('string');
    expect(out.kits).toHaveLength(3);

    const byId = new Map(out.kits.map((k) => [k.id, k]));

    // The valid case ran (proving the earlier failure did not abort the batch).
    const ok = byId.get('case-ok')!;
    expect(ok.status).toBe('ok');
    expect(ok.error).toBeNull();
    expect(ok.kit).not.toBeNull();
    expect(validateKit(ok.kit).ok).toBe(true);

    // Invalid days → failed with a structured error, kit null.
    const badDays = byId.get('case-bad-days')!;
    expect(badDays.status).toBe('failed');
    expect(badDays.kit).toBeNull();
    expect(badDays.error?.code).toBe('INVALID_INPUT');

    // Malformed case → recorded failed, not thrown.
    const malformed = byId.get('case-malformed')!;
    expect(malformed.status).toBe('failed');
    expect(malformed.error?.code).toBe('INVALID_CASE');

    expect(seen).toEqual(['case-bad-days', 'case-ok', 'case-malformed']);
  });

  it('returns an empty, valid envelope when the input is not an array', async () => {
    const out = await runBatch({ not: 'an array' }, { llm: multiStub(CANNED) });
    expect(out.version).toBe('1.0');
    expect(out.kits).toEqual([]);
  });

  describe('allowLocal is secure by default', () => {
    // A local company site the fetch would serve if we were allowed to reach it.
    const localSite: FetchFn = async (url) => {
      const pages: Record<string, string> = {
        'http://127.0.0.1:8099/acme/': '<title>Acme</title><a href="/acme/about">About</a>',
        'http://127.0.0.1:8099/robots.txt': '',
        'http://127.0.0.1:8099/acme/about': '<title>About</title>Acme is a fintech.',
      };
      const body = pages[url] ?? pages[url.replace(/\/$/, '')];
      const ct = url.endsWith('robots.txt') ? 'text/plain' : 'text/html';
      return body === undefined
        ? new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } })
        : new Response(body, { status: 200, headers: { 'content-type': ct } });
    };
    const localCase = [
      { id: 'local', jd: 'Backend Engineer. Node + mentoring required.', company_url: 'http://127.0.0.1:8099/acme/', days: 2 },
    ];

    it('does NOT crawl a loopback company URL by default (no allowLocal)', async () => {
      const out = await runBatch(localCase, { llm: multiStub(CANNED), fetchFn: localSite });
      const kit = out.kits[0].kit!;
      expect(out.kits[0].status).toBe('ok'); // still produces a kit from the JD
      expect(kit.source.pages_used).toEqual([]); // but the local site was blocked
    });

    it('DOES crawl the same loopback URL when allowLocal is explicitly true', async () => {
      const out = await runBatch(localCase, {
        llm: multiStub(CANNED),
        fetchFn: localSite,
        allowLocal: true,
      });
      const kit = out.kits[0].kit!;
      expect(out.kits[0].status).toBe('ok');
      expect(kit.source.pages_used.length).toBeGreaterThan(0); // reached the local site
    });
  });
});
