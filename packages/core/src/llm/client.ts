import { BackoffOptions, withBackoff } from './backoff.js';
import { loadLlmConfig, type LlmConfig } from './config.js';
import { LlmError, isRetryableLlmError } from './errors.js';
import { RateLimiter } from './rate-limiter.js';
import type { ChatMessage, ChatOptions, CallJSONOptions, FetchFn, LlmClient, SleepFn } from './types.js';

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { total_tokens?: number };
}

const defaultFetch: FetchFn = (url, init) => fetch(url, init);
const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rough token estimate (~4 chars/token) for rate-limit accounting. */
function estimateTokensDefault(messages: ChatMessage[], maxTokens?: number): number {
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  return Math.ceil(chars / 4) + (maxTokens ?? 512);
}

export interface ClientOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
  rateLimiter?: RateLimiter;
  backoff?: BackoffOptions;
  sleep?: SleepFn;
  estimateTokens?: (messages: ChatMessage[], maxTokens?: number) => number;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function parseRetryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return undefined;
}

/** Best-effort JSON extraction: direct parse, else the outermost {...} / [...]. */
export function tryParseJson(text: string): unknown {
  const attempt = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const direct = attempt(text.trim());
  if (direct !== undefined) return direct;

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const obj = attempt(text.slice(firstBrace, lastBrace + 1));
    if (obj !== undefined) return obj;
  }

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return attempt(text.slice(firstBracket, lastBracket + 1));
  }
  return undefined;
}

/** OpenAI-compatible chat client with rate limiting, backoff and JSON validation. */
export class OpenAICompatibleClient implements LlmClient {
  private readonly config: LlmConfig;
  private readonly fetchFn: FetchFn;
  private readonly timeoutMs: number;
  private readonly rateLimiter: RateLimiter;
  private readonly backoff: BackoffOptions;
  private readonly estimateTokens: (messages: ChatMessage[], maxTokens?: number) => number;

  constructor(config: LlmConfig, options: ClientOptions = {}) {
    this.config = config;
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.rateLimiter =
      options.rateLimiter ??
      new RateLimiter({ maxRequestsPerMinute: 25, maxTokensPerMinute: 100_000 });
    this.backoff = { sleep: options.sleep ?? realSleep, ...options.backoff };
    this.estimateTokens = options.estimateTokens ?? estimateTokensDefault;
  }

  async chat(options: ChatOptions): Promise<string> {
    await this.rateLimiter.acquire(this.estimateTokens(options.messages, options.maxTokens));
    return withBackoff(() => this.singleCall(options), isRetryableLlmError, this.backoff);
  }

  private async singleCall(options: ChatOptions): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: options.messages,
          temperature: options.temperature ?? 0.7,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      // Rate limited or server error → retryable (honour Retry-After if given).
      if (res.status === 429 || res.status >= 500) {
        throw new LlmError(
          `LLM temporarily unavailable (${res.status}): ${await safeText(res)}`,
          res.status,
          true,
          parseRetryAfterMs(res),
        );
      }
      // Other non-2xx → not retryable (bad key, bad request, etc.).
      if (!res.ok) {
        throw new LlmError(
          `LLM request failed (${res.status}): ${await safeText(res)}`,
          res.status,
          false,
        );
      }

      const data = (await res.json()) as OpenAIResponse;
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new LlmError('LLM response contained no message content', res.status, false);
      }
      return content;
    } catch (err) {
      // Turn a timeout/abort into a retryable error so backoff can try again.
      if (err instanceof Error && err.name === 'AbortError') {
        throw new LlmError(`LLM request timed out after ${this.timeoutMs}ms`, undefined, true);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async callJSON<T>(options: CallJSONOptions<T>): Promise<T> {
    const maxJsonRetries = options.maxJsonRetries ?? 2;
    const messages: ChatMessage[] = [...options.messages];
    let lastProblem = '';

    for (let attempt = 0; attempt <= maxJsonRetries; attempt++) {
      const raw = await this.chat({
        messages,
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens,
        jsonMode: true,
      });

      const parsed = tryParseJson(raw);
      if (parsed !== undefined) {
        const result = options.schema.safeParse(parsed);
        if (result.success) return result.data;
        lastProblem = result.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
      } else {
        lastProblem = 'The response was not valid JSON.';
      }

      // Feed the failure back and ask for a corrected JSON-only reply.
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content: `That response was invalid: ${lastProblem}. Reply again with ONLY valid JSON that fixes these problems — no prose, no code fences.`,
      });
    }

    throw new LlmError(
      `LLM did not return schema-valid JSON after ${maxJsonRetries + 1} attempts. Last problem: ${lastProblem}`,
    );
  }
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Build a client from environment variables. Optional LLM_MAX_RPM / LLM_MAX_TPM
 * tune the rate limiter to a given free tier without code changes.
 */
export function createLlmClient(
  env: NodeJS.ProcessEnv = process.env,
  options: ClientOptions = {},
): OpenAICompatibleClient {
  const config = loadLlmConfig(env);
  const rateLimiter =
    options.rateLimiter ??
    new RateLimiter({
      maxRequestsPerMinute: intFromEnv(env.LLM_MAX_RPM, 25),
      maxTokensPerMinute: intFromEnv(env.LLM_MAX_TPM, 100_000),
    });
  return new OpenAICompatibleClient(config, { ...options, rateLimiter });
}
