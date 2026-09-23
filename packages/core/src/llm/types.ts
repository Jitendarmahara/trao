import type { ZodType } from 'zod';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for a JSON object response (OpenAI `response_format`). */
  jsonMode?: boolean;
}

export interface CallJSONOptions<T> {
  messages: ChatMessage[];
  /** The shape the returned JSON must satisfy. Invalid output is retried. */
  schema: ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  /** Extra attempts if the model returns invalid/malformed JSON. Default 2. */
  maxJsonRetries?: number;
}

/** Injectable fetch so tests need no network. Matches the global `fetch` shape. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Injectable sleep so tests need no real waiting. */
export type SleepFn = (ms: number) => Promise<void>;

export interface LlmClient {
  /** Single chat completion; returns the assistant message content. */
  chat(options: ChatOptions): Promise<string>;
  /** Chat completion whose content is parsed + validated against a schema. */
  callJSON<T>(options: CallJSONOptions<T>): Promise<T>;
}
