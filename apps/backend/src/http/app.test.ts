import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { PipelineError, type Kit } from '@interview-prep-kit/core';
import { createInMemoryRepositories } from '../db/memory.js';
import type { PipelineRunner } from '../pipeline-runner.js';
import { buildApp, type AppDeps } from './app.js';

function validKit(company: string): Kit {
  return {
    source: { company, company_url: 'http://x', role: 'Engineer', location: '', jd_chars: 10, researched_at: '', pages_used: [] },
    company_brief: { summary: '', what_they_do: '', sources: [] },
    role: { title: 'Engineer', seniority: '', responsibilities: [], requirements: [{ id: 'r1', text: 'Node', kind: 'technical', priority: 'must' }] },
    questions: [{ id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'P', answer_outline: 'A', difficulty: 2 }],
    flashcards: [],
    schedule: { days_available: 1, days: [{ day: 1, focus: '', question_ids: ['q1'], minutes: 40 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  } as Kit;
}

const okRunner: PipelineRunner = {
  run: async (input, onProgress) => {
    onProgress('extracting');
    onProgress('done');
    return { kit: validKit(input.companyName ?? 'Acme'), skipped: [{ url: 'http://x/gone', reason: 'HTTP 404' }] };
  },
};
const failRunner: PipelineRunner = {
  run: async () => {
    throw new PipelineError('COVERAGE_INCOMPLETE', 'uncovered must-have r1');
  },
};

function makeApp(over: Partial<AppDeps> = {}) {
  return buildApp({
    repositories: createInMemoryRepositories(),
    runner: okRunner,
    sessionSecret: 'test-secret',
    awaitGeneration: true,
    ...over,
  });
}
const creds = { email: 'a@example.com', password: 'password123' };

describe('auth', () => {
  it('registers, sets a session, and returns the user from /auth/me', async () => {
    const agent = request.agent(makeApp());
    const reg = await agent.post('/auth/register').send(creds);
    expect(reg.status).toBe(201);
    const me = await agent.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(creds.email);
  });

  it('rejects duplicate registration (409) and bad login (401)', async () => {
    const app = makeApp();
    await request.agent(app).post('/auth/register').send(creds);
    expect((await request(app).post('/auth/register').send(creds)).status).toBe(409);
    expect((await request(app).post('/auth/login').send({ ...creds, password: 'wrongwrong' })).status).toBe(401);
  });

  it('blocks protected endpoints when signed out (401)', async () => {
    const app = makeApp();
    expect((await request(app).get('/kits')).status).toBe(401);
    expect((await request(app).post('/kits').send({ jd: 'x', companyUrl: 'http://x', days: 3 })).status).toBe(401);
  });

  it('logout clears the session', async () => {
    const agent = request.agent(makeApp());
    await agent.post('/auth/register').send(creds);
    await agent.post('/auth/logout');
    expect((await agent.get('/auth/me')).status).toBe(401);
  });
});

describe('kits', () => {
  it('creates a kit (awaited), then lists and reopens it', async () => {
    const agent = request.agent(makeApp());
    await agent.post('/auth/register').send(creds);

    const create = await agent.post('/kits').send({ jd: 'JD', companyUrl: 'http://acme', companyName: 'Acme', days: 2 });
    expect(create.status).toBe(201);
    expect(create.body.job.status).toBe('done');
    const kitId = create.body.job.kitId as string;
    expect(kitId).toBeTruthy();

    const list = await agent.get('/kits');
    expect(list.body.kits).toHaveLength(1);
    expect(list.body.kits[0].company).toBe('Acme');

    const got = await agent.get(`/kits/${kitId}`);
    expect(got.status).toBe(200);
    expect(got.body.kit.role.title).toBe('Engineer');
    expect(got.body.skipped[0].reason).toBe('HTTP 404');
  });

  it('records a failed generation as a failed job with a structured error', async () => {
    const agent = request.agent(makeApp({ runner: failRunner }));
    await agent.post('/auth/register').send(creds);
    const create = await agent.post('/kits').send({ jd: 'JD', companyUrl: 'http://acme', days: 2 });
    expect(create.body.job.status).toBe('failed');
    expect(create.body.job.error.code).toBe('COVERAGE_INCOMPLETE');
    expect(create.body.job.kitId).toBeNull();
  });

  it('does NOT persist a kit that fails the Appendix A contract (validateKit gate)', async () => {
    const invalidRunner: PipelineRunner = {
      // difficulty 5 is out of the 1..3 range → validateKit must reject it.
      run: async () => {
        const bad = validKit('Acme');
        (bad.questions[0] as { difficulty: number }).difficulty = 5;
        return { kit: bad, skipped: [] };
      },
    };
    const agent = request.agent(makeApp({ runner: invalidRunner }));
    await agent.post('/auth/register').send(creds);
    const create = await agent.post('/kits').send({ jd: 'JD', companyUrl: 'http://acme', days: 1 });
    expect(create.body.job.status).toBe('failed');
    expect(create.body.job.error.code).toBe('INVALID_KIT');
    expect(create.body.job.kitId).toBeNull();
    expect((await agent.get('/kits')).body.kits).toHaveLength(0); // nothing stored
  });

  it('de-duplicates an in-flight identical generation (returns the same job)', async () => {
    // A runner that never resolves keeps the first job "running" so the second
    // identical request must find it rather than starting a second run.
    const hangingRunner: PipelineRunner = { run: () => new Promise(() => {}) };
    const app = makeApp({ runner: hangingRunner, awaitGeneration: false });
    const agent = request.agent(app);
    await agent.post('/auth/register').send(creds);
    const body = { jd: 'JD', companyUrl: 'http://acme', days: 2 };
    const first = await agent.post('/kits').send(body);
    const second = await agent.post('/kits').send(body);
    expect(first.status).toBe(202);
    expect(second.body.jobId).toBe(first.body.jobId); // same run
    expect(second.body.deduplicated).toBe(true);
  });

  it('validates the create request (400 on bad days)', async () => {
    const agent = request.agent(makeApp());
    await agent.post('/auth/register').send(creds);
    const bad = await agent.post('/kits').send({ jd: 'JD', companyUrl: 'http://acme', days: 0 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_INPUT');
  });

  it('enforces ownership: another user gets 403, unknown kit gets 404', async () => {
    const app = makeApp();
    const alice = request.agent(app);
    await alice.post('/auth/register').send(creds);
    const kitId = (await alice.post('/kits').send({ jd: 'JD', companyUrl: 'http://acme', days: 1 })).body.job.kitId;

    const bob = request.agent(app);
    await bob.post('/auth/register').send({ email: 'b@example.com', password: 'password123' });
    expect((await bob.get(`/kits/${kitId}`)).status).toBe(403);
    expect((await bob.get('/kits/does-not-exist')).status).toBe(404);
    // Bob sees none of Alice's kits.
    expect((await bob.get('/kits')).body.kits).toHaveLength(0);
  });
});
