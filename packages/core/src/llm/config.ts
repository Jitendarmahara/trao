/** Resolved LLM connection settings (OpenAI-compatible). */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Read LLM settings from environment variables (documented in .env.example).
 * Provider-agnostic: the same three variables point at Groq (free), DeepSeek, or
 * any OpenAI-compatible endpoint.
 */
export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const baseUrl = env.LLM_BASE_URL?.trim();
  const apiKey = env.LLM_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim();

  const missing = [
    ['LLM_BASE_URL', baseUrl],
    ['LLM_API_KEY', apiKey],
    ['LLM_MODEL', model],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Missing LLM configuration: ${missing.join(', ')}. See .env.example for how to set them.`,
    );
  }

  return {
    // Non-null: presence checked above.
    baseUrl: baseUrl!.replace(/\/+$/, ''),
    apiKey: apiKey!,
    model: model!,
  };
}
