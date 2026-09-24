import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, ApiError, setApiBase } from './api.js';

interface Call {
  url: string;
  method: string;
  body: unknown;
}

let lastCall: Call | undefined;
function mockFetch(status: number, payload: unknown): void {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    lastCall = {
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
}

beforeEach(() => {
  setApiBase('/api');
  lastCall = undefined;
  vi.unstubAllGlobals();
});

describe('api client — requests', () => {
  it('register posts credentials to /api/auth/register', async () => {
    mockFetch(201, { user: { id: 'u1', email: 'a@b.com' } });
    const res = await api.register('a@b.com', 'password123');
    expect(lastCall).toMatchObject({ url: '/api/auth/register', method: 'POST', body: { email: 'a@b.com', password: 'password123' } });
    expect(res.user.email).toBe('a@b.com');
  });

  it('createKit posts the input and returns a jobId', async () => {
    mockFetch(202, { jobId: 'job-1' });
    const res = await api.createKit({ jd: 'JD', companyUrl: 'http://x', days: 5 });
    expect(lastCall?.url).toBe('/api/kits');
    expect(lastCall?.body).toEqual({ jd: 'JD', companyUrl: 'http://x', days: 5 });
    expect(res.jobId).toBe('job-1');
  });

  it('getJob / getKit use GET with the id in the path', async () => {
    mockFetch(200, { job: { id: 'j', status: 'done', kitId: 'k', error: null } });
    await api.getJob('j');
    expect(lastCall).toMatchObject({ url: '/api/jobs/j', method: 'GET' });
    expect(lastCall?.body).toBeUndefined();
  });
});

describe('api client — builder sends COMMANDS, never the whole kit', () => {
  it('editQuestion PATCHes only the patch fields', async () => {
    mockFetch(200, { kit: {}, updatedAt: 'now' });
    await api.editQuestion('k1', 'q1', { prompt: 'new prompt' });
    expect(lastCall?.method).toBe('PATCH');
    expect(lastCall?.url).toBe('/api/kits/k1/questions/q1');
    expect(lastCall?.body).toEqual({ prompt: 'new prompt' });
    // Critically: the body must NOT contain a whole kit.
    expect(lastCall?.body).not.toHaveProperty('questions');
    expect(lastCall?.body).not.toHaveProperty('schedule');
  });

  it('moveQuestion / reorder / regenerate send minimal commands', async () => {
    mockFetch(200, { kit: {}, updatedAt: 'now' });
    await api.moveQuestion('k1', 'q1', 'system-design');
    expect(lastCall).toMatchObject({ url: '/api/kits/k1/questions/q1/move', body: { category: 'system-design' } });

    await api.reorder('k1', 'technical', ['q2', 'q1']);
    expect(lastCall).toMatchObject({ url: '/api/kits/k1/reorder', body: { category: 'technical', orderedIds: ['q2', 'q1'] } });

    await api.regenerate('k1', 'technical');
    expect(lastCall).toMatchObject({ url: '/api/kits/k1/sections/technical/regenerate', method: 'POST' });
    expect(lastCall?.body).toBeUndefined(); // no kit, no payload
  });
});

describe('api client — errors', () => {
  it('throws ApiError with the structured code/message on a non-2xx', async () => {
    mockFetch(403, { error: { code: 'FORBIDDEN', message: 'Not yours' } });
    await expect(api.getKit('k1')).rejects.toMatchObject({ name: 'ApiError', status: 403, code: 'FORBIDDEN' });
  });
});
