import { z } from 'zod';
import type {
  CompanyBrief,
  CoveragePassInfo,
  Flashcard,
  InterviewResearch,
  InterviewResearchDiagnostics,
  Kit,
  Question,
  ScheduleDay,
} from '@interview-prep-kit/core';

/** Real case shape (extends the batch case with an optional role label). */
export const RealCaseSchema = z.object({
  id: z.string().min(1),
  jd: z.string(),
  company_url: z.string(),
  days: z.number(),
  role: z.string().optional(),
});
export type RealCase = z.infer<typeof RealCaseSchema>;

export interface StageTiming {
  stage: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: 'ok' | 'failed';
  error: string | null;
}

/** Bounded per-page evidence (text is already capped by the crawler). */
export interface PageEvidence {
  url: string;
  title?: string;
  hiring: boolean;
  text: string;
}

export interface RetrievalEvidence {
  company_url: string;
  pages_used: string[];
  homepage: PageEvidence | null;
  hiring_pages: PageEvidence[];
  other_pages: PageEvidence[];
  skipped: { url: string; reason: string }[];
}

export interface DeterministicChecks {
  structure_valid: boolean;
  requirement_count: number;
  must_requirement_count: number;
  nice_requirement_count: number;
  question_count: number;
  flashcard_count: number;
  schedule_day_count: number;
  schedule_question_count: number;
  uncovered_must_requirements: string[];
  duplicate_question_ids: string[];
  duplicate_requirement_ids: string[];
  invalid_requirement_references: string[];
  invalid_question_references: string[];
  questions_missing_requirement_links: string[];
  schedule_missing_question_ids: string[];
  schedule_duplicate_question_ids: string[];
  all_must_haves_covered: boolean;
}

export interface TraceEntry {
  requirement_id: string;
  requirement_text: string;
  priority: string;
  kind: string;
  question_ids: string[];
}

export interface LlmCallMetric {
  success: boolean;
  duration_ms: number;
}

export interface CaseReport {
  id: string;
  company_url: string;
  role: string | null;
  requested_days: number;
  status: 'ok' | 'failed';
  timing: { started_at: string; finished_at: string; duration_ms: number };
  stages: StageTiming[];
  extraction: {
    title: string;
    seniority: string;
    responsibilities: string[];
    requirements: { id: string; text: string; kind: string; priority: string }[];
  } | null;
  retrieval: RetrievalEvidence | null;
  interview_research: InterviewResearch | null;
  interview_research_diagnostics: InterviewResearchDiagnostics | null;
  company_brief: CompanyBrief | null;
  initial_generation: { initial_questions: Question[]; flashcards: Flashcard[] } | null;
  coverage: {
    passes: number;
    uncovered_requirement_ids: string[];
    passes_detail: CoveragePassInfo[];
  } | null;
  schedule: ScheduleDay[] | null;
  checks: DeterministicChecks | null;
  requirement_question_trace: TraceEntry[] | null;
  llm: { model: string; call_count: number; total_duration_ms: number; calls: LlmCallMetric[] };
  final_kit: Kit | null;
  error: { code: string; message: string } | null;
}

export interface RealCompanyReport {
  report_version: string;
  generated_at: string;
  cases: CaseReport[];
}
