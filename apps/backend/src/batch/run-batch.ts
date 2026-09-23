import {
  PipelineError,
  runPipeline,
  type FetchFn,
  type LlmClient,
  type SearchProvider,
} from '@interview-prep-kit/core';
import { CaseSchema, type BatchOutput, type KitResult } from './types.js';

export const BATCH_VERSION = '1.0';

export interface RunBatchOptions {
  llm: Pick<LlmClient, 'callJSON'>;
  searchProvider?: SearchProvider;
  /** Injected fetch (tests). Real runs use the global fetch. */
  fetchFn?: FetchFn;
  /** Batch company sites may be served locally, so default to allowing localhost. */
  allowLocal?: boolean;
  onCase?: (id: string, status: 'ok' | 'failed') => void;
}

/**
 * Run the SAME pipeline the app uses over an array of cases (Section 9). Each
 * case uses its own `days`. A case that throws is recorded as `failed` with a
 * structured error and the run CONTINUES — one bad case never aborts the batch.
 * Malformed cases are recorded as failed too, rather than crashing.
 */
export async function runBatch(casesInput: unknown, options: RunBatchOptions): Promise<BatchOutput> {
  const kits: KitResult[] = [];
  const cases = Array.isArray(casesInput) ? casesInput : [];

  for (let i = 0; i < cases.length; i++) {
    const parsed = CaseSchema.safeParse(cases[i]);
    if (!parsed.success) {
      const raw = cases[i] as { id?: unknown };
      const id = typeof raw?.id === 'string' ? raw.id : `case-${i + 1}`;
      const message = parsed.error.issues
        .map((e) => `${e.path.join('.') || '(root)'}: ${e.message}`)
        .join('; ');
      kits.push({ id, status: 'failed', kit: null, error: { code: 'INVALID_CASE', message } });
      options.onCase?.(id, 'failed');
      continue;
    }

    const c = parsed.data;
    try {
      const { kit } = await runPipeline(
        { jd: c.jd, companyUrl: c.company_url, days: c.days },
        {
          llm: options.llm,
          searchProvider: options.searchProvider,
          fetchFn: options.fetchFn,
          allowLocal: options.allowLocal ?? true,
        },
      );
      kits.push({ id: c.id, status: 'ok', kit, error: null });
      options.onCase?.(c.id, 'ok');
    } catch (err) {
      const code = err instanceof PipelineError ? err.code : 'PIPELINE_ERROR';
      const message = err instanceof Error ? err.message : String(err);
      kits.push({ id: c.id, status: 'failed', kit: null, error: { code, message } });
      options.onCase?.(c.id, 'failed');
    }
  }

  return { version: BATCH_VERSION, generated_at: new Date().toISOString(), kits };
}
