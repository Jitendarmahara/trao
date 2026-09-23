import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { loadLlmConfig } from './config.js';
import { RateLimiter } from './rate-limiter.js';
import { withBackoff } from './backoff.js';
import { LlmError, isRetryableLlmError } from './errors.js';
import { OpenAICompatibleClient, tryParseJson } from './client.js';
import type { FetchFn } from './types.js';

const noSleep = async (): Promise<void> => {};

/** Build a client wired for fast, network-free tests. */
function makeClient(fetchFn: FetchFn): OpenAICompatibleClient {
  return new OpenAICompatibleClient(
    { baseUrl: 'http://llm.test', apiKey: 'test-key', model: 'test-model' },
    {
      fetchFn,
      sleep: noSleep,
      backoff: { baseDelayMs: 1, maxDelayMs: 2, sleep: noSleep, random: () => 0 },
      rateLimiter: new RateLimiter({
        maxRequestsPerMinute: 1000,
        maxTokensPerMinute: 1_000_000,
        now: () => 0,
        sleep: noSleep,
      }),
    },
  );
}

function chatResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

describe('loadLlmConfig', () => {
  it('throws when variables are missing, naming them', () => {
    expect(() => loadLlmConfig({})).toThrow(/LLM_BASE_URL/);
  });

  it('reads config and strips a trailing slash from the base URL', () => {
    const cfg = loadLlmConfig({
      LLM_BASE_URL: 'https://api.example.com/v1/',
      LLM_API_KEY: 'k',
      LLM_MODEL: 'm',
    });
    expect(cfg.baseUrl).toBe('https://api.example.com/v1');
    expect(cfg.model).toBe('m');
  });
});

describe('RateLimiter', () => {
  it('blocks a third request when only two per minute are allowed', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 2,
      maxTokensPerMinute: 1_000_000,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });

    await limiter.acquire(10);
    await limiter.acquire(10);
    await limiter.acquire(10); // must wait for the window to roll

    expect(sleeps.length).toBe(1);
    expect(clock).toBeGreaterThanOrEqual(60_000);
  });

  it('caps on tokens per minute, not just request count', async () => {
    let clock = 0;
    let waited = false;
    const limiter = new RateLimiter({
      maxRequestsPerMinute: 1000,
      maxTokensPerMinute: 100,
      now: () => clock,
      sleep: async (ms) => {
        waited = true;
        clock += ms;
      },
    });

    await limiter.acquire(80);
    await limiter.acquire(80); // 160 > 100 → must wait
    expect(waited).toBe(true);
  });
});

describe('withBackoff', () => {
  it('retries retryable errors then succeeds', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const out = await withBackoff(
      async () => {
        calls++;
        if (calls < 3) throw new LlmError('rate limited', 429, true);
        return 'ok';
      },
      isRetryableLlmError,
      { baseDelayMs: 1, sleep: async (ms) => void sleeps.push(ms), random: () => 0 },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
    expect(sleeps.length).toBe(2);
  });

  it('does not retry a non-retryable error', async () => {
    let calls = 0;
    await expect(
      withBackoff(
        async () => {
          calls++;
          throw new LlmError('bad request', 400, false);
        },
        isRetryableLlmError,
        { sleep: noSleep },
      ),
    ).rejects.toBeInstanceOf(LlmError);
    expect(calls).toBe(1);
  });

  it('honours a provider Retry-After delay', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    await withBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new LlmError('slow down', 429, true, 1234);
        return 'ok';
      },
      isRetryableLlmError,
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(sleeps[0]).toBe(1234);
  });
});

describe('tryParseJson', () => {
  it('parses clean JSON', () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('extracts JSON embedded in prose / code fences', () => {
    expect(tryParseJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('returns undefined for non-JSON', () => {
    expect(tryParseJson('no json here')).toBeUndefined();
  });
});

describe('OpenAICompatibleClient.chat', () => {
  it('retries on 429 then returns content', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      if (calls === 1) return new Response(null, { status: 429, headers: { 'retry-after': '0' } });
      return chatResponse('hello world');
    });
    const out = await client.chat({ messages: [{ role: 'user', content: 'hi' }] });
    expect(out).toBe('hello world');
    expect(calls).toBe(2);
  });

  it('throws without retry on a 400', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      return new Response('bad key', { status: 400 });
    });
    await expect(client.chat({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toBeInstanceOf(
      LlmError,
    );
    expect(calls).toBe(1);
  });
});

describe('OpenAICompatibleClient.callJSON', () => {
  const schema = z.object({ answer: z.string() });

  it('returns parsed, schema-valid JSON', async () => {
    const client = makeClient(async () => chatResponse(JSON.stringify({ answer: '42' })));
    const out = await client.callJSON({ messages: [{ role: 'user', content: 'q' }], schema });
    expect(out.answer).toBe('42');
  });

  it('self-corrects when the first response is not valid JSON', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      return chatResponse(calls === 1 ? 'not json at all' : JSON.stringify({ answer: 'fixed' }));
    });
    const out = await client.callJSON({ messages: [{ role: 'user', content: 'q' }], schema });
    expect(out.answer).toBe('fixed');
    expect(calls).toBe(2);
  });

  it('retries when JSON is valid but fails the schema', async () => {
    let calls = 0;
    const client = makeClient(async () => {
      calls++;
      return chatResponse(
        calls === 1 ? JSON.stringify({ wrong: true }) : JSON.stringify({ answer: 'ok' }),
      );
    });
    const out = await client.callJSON({ messages: [{ role: 'user', content: 'q' }], schema });
    expect(out.answer).toBe('ok');
    expect(calls).toBe(2);
  });

  it('gives up with a clear error after exhausting retries', async () => {
    const client = makeClient(async () => chatResponse('never json'));
    await expect(
      client.callJSON({ messages: [{ role: 'user', content: 'q' }], schema, maxJsonRetries: 1 }),
    ).rejects.toThrow(/valid JSON/);
  });
});
