import { describe, it, expect } from 'vitest';
import { runPipeline, type PipelineStage } from './pipeline.js';
import { StaticSearchProvider } from '../interview-research/index.js';
import { validateKit } from '../kit/index.js';
import type { LlmClient } from '../llm/index.js';
import type { FetchFn } from '../shared/http.js';

/**
 * Stub LLM: tries a set of canned objects and returns the first that satisfies
 * the schema of the current call. The shapes are distinct, so each generation
 * step gets the right data — no network.
 */
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
  // extraction (role)
  {
    title: 'Senior Backend Engineer',
    seniority: 'senior',
    responsibilities: ['Build APIs'],
    requirements: [
      { text: '5+ years with Node', kind: 'technical', priority: 'must' },
      { text: 'Mentoring junior engineers', kind: 'behavioural', priority: 'must' },
    ],
  },
  // company brief
  { summary: 'Acme builds payment infrastructure.', what_they_do: 'A payments API.' },
  // questions (covers r1 and r2; filtered per category)
  { questions: [{ requirement_ids: ['r1', 'r2'], prompt: 'P', answer_outline: 'A', difficulty: 2 }] },
  // flashcards
  { flashcards: [{ front: 'Q', back: 'A', requirement_ids: ['r1'] }] },
  // interview-research summary
  { summary: 'Take-home then a system design round.', rounds: ['take-home', 'system design'] },
];

const HOMEPAGE = `<title>Acme</title><h1>Acme builds payment APIs</h1>
  <a href="/about">About</a><a href="/company/join">Join the team</a>`;
const DISCUSSION =
  '<title>Acme interview</title><body>Take-home exercise, then a system design round, plus behavioural questions.</body>';

function site(overrides: Record<string, { status?: number; body?: string; contentType?: string }> = {}): FetchFn {
  const base: Record<string, { status?: number; body?: string; contentType?: string }> = {
    'http://acme.test/': { body: HOMEPAGE },
    'http://acme.test/robots.txt': { contentType: 'text/plain', body: '' },
    'http://acme.test/about': { body: '<title>About</title>Acme is a fintech.' },
    'http://acme.test/company/join': { body: '<title>Join</title>We hire with a take-home.' },
    'https://blog.test/acme': { body: DISCUSSION },
    ...overrides,
  };
  return async (url) => {
    const page = base[url] ?? base[url.replace(/\/$/, '')];
    if (!page) return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
    return new Response(page.body ?? '', {
      status: page.status ?? 200,
      headers: { 'content-type': page.contentType ?? 'text/html' },
    });
  };
}

describe('runPipeline (end to end, offline)', () => {
  it('produces a complete, valid kit and emits stages in order', async () => {
    const stages: PipelineStage[] = [];
    const result = await runPipeline(
      { jd: 'Senior Backend Engineer. 5+ years Node required. Mentoring a plus.', companyUrl: 'http://acme.test', days: 3 },
      {
        llm: multiStub(CANNED),
        searchProvider: new StaticSearchProvider([{ url: 'https://blog.test/acme', title: 'exp' }]),
        fetchFn: site(),
        onProgress: (s) => stages.push(s),
      },
    );

    // Valid kit.
    expect(validateKit(result.kit).ok).toBe(true);

    // Requirements extracted with stable ids.
    expect(result.kit.role.requirements.map((r) => r.id)).toEqual(['r1', 'r2']);

    // Both must-haves covered (no gap), so nothing uncovered.
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual([]);

    // Research changed the output: system-design + company-fit categories present.
    const categories = new Set(result.kit.questions.map((q) => q.category));
    expect(categories.has('system-design')).toBe(true);
    expect(categories.has('company-fit')).toBe(true);

    // Schedule spans exactly the requested days; brief has real sources.
    expect(result.kit.schedule.days_available).toBe(3);
    expect(result.kit.source.pages_used.length).toBeGreaterThan(0);
    expect(result.kit.company_brief.sources.length).toBeGreaterThan(0);

    // Stages fired in the genuine sequence.
    expect(stages).toEqual([
      'extracting',
      'crawling',
      'interview-research',
      'generating',
      'covering',
      'scheduling',
      'validating',
      'done',
    ]);
  });

  it('thin JD → thin honest kit (no questions, nothing invented)', async () => {
    const result = await runPipeline(
      { jd: '   ', companyUrl: 'http://acme.test', days: 2 },
      { llm: multiStub(CANNED), fetchFn: site() },
    );
    expect(validateKit(result.kit).ok).toBe(true);
    expect(result.kit.role.requirements).toEqual([]);
    expect(result.kit.questions).toEqual([]);
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual([]);
  });

  it('an unreachable company site is not fatal — honest brief + recorded skip', async () => {
    const result = await runPipeline(
      { jd: 'Backend role, Node required.', companyUrl: 'http://acme.test', days: 2 },
      {
        llm: multiStub(CANNED),
        fetchFn: async () => new Response('down', { status: 500 }),
      },
    );
    expect(validateKit(result.kit).ok).toBe(true);
    expect(result.kit.company_brief.summary).toMatch(/little public information/i);
    expect(result.skipped.length).toBeGreaterThan(0);
    // No company info and no search provider → no company-fit / system-design.
    const categories = new Set(result.kit.questions.map((q) => q.category));
    expect(categories.has('company-fit')).toBe(false);
    expect(categories.has('system-design')).toBe(false);
  });
});
