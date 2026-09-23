/**
 * @interview-prep-kit/core — the shared engine.
 *
 * This package holds every piece of domain logic that BOTH the web app and the
 * batch CLI use (so there is one pipeline, never a parallel implementation):
 *   - the exact kit schema + validator (Appendix A)      [Step 1]
 *   - the OpenAI-compatible LLM client                   [Step 2]
 *   - the company-site crawler + interview research      [Step 3A / 3B]
 *   - requirement extraction                             [Step 4]
 *   - generation (brief, questions, flashcards)          [Step 5]
 *   - the deterministic coverage check + second pass     [Step 6]
 *   - the deterministic schedule allocator               [Step 7]
 *   - the pipeline that orchestrates them                [Step 8]
 *
 * Modules land here as they are built.
 */
export const CORE_VERSION = '0.1.0';

// Step 1 — the exact kit structure (Appendix A) and its validator.
export * from './kit/index.js';

// Step 2 — the OpenAI-compatible LLM client (rate limit + backoff + JSON safety).
export * from './llm/index.js';

// Step 3A — company-site crawler (rank links, robots, SSRF guard).
export * from './retrieval/index.js';

// Step 3B — public interview-process research (first-class stage).
export * from './interview-research/index.js';
