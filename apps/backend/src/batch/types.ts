import { z } from 'zod';
import type { Kit } from '@interview-prep-kit/core';

/** One input case from the file given to `npm run evaluate` (Appendix B input). */
export const CaseSchema = z.object({
  id: z.string().min(1),
  jd: z.string(),
  company_url: z.string(),
  days: z.number(),
});
export type EvaluationCase = z.infer<typeof CaseSchema>;

/** One entry in the output file (Appendix B), keyed by the case id. */
export interface KitResult {
  id: string;
  status: 'ok' | 'failed';
  kit: Kit | null;
  error: { code: string; message: string } | null;
}

/** The single JSON file the command writes (Appendix B shape). */
export interface BatchOutput {
  version: string;
  generated_at: string;
  kits: KitResult[];
}
