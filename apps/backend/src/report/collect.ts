import {
  PipelineError,
  runPipeline,
  type CompanyBrief,
  type CompanyResearch,
  type Coverage,
  type CoveragePassInfo,
  type CrawledPage,
  type ExtractedRole,
  type FetchFn,
  type Flashcard,
  type InterviewResearch,
  type InterviewResearchDiagnostics,
  type Kit,
  type LlmClient,
  type PipelineArtifact,
  type PipelineStage,
  type Question,
  type SearchProvider,
} from '@interview-prep-kit/core';
import { buildTrace, computeChecks } from './checks.js';
import type {
  CaseReport,
  LlmCallMetric,
  PageEvidence,
  RealCase,
  RetrievalEvidence,
  StageTiming,
} from './types.js';

export interface CollectOptions {
  llm: Pick<LlmClient, 'callJSON'>;
  searchProvider?: SearchProvider;
  fetchFn?: FetchFn;
  allowLocal?: boolean;
  model: string;
}

function toPageEvidence(p: CrawledPage): PageEvidence {
  return { url: p.url, title: p.title, hiring: p.hiring, text: p.text };
}

/**
 * Run ONE real case through the exact production runPipeline(), capturing
 * intermediate evidence via the observability hooks (no logic duplicated). On
 * failure, everything gathered before the failure is retained.
 */
export async function collectCase(c: RealCase, options: CollectOptions): Promise<CaseReport> {
  const startedAt = Date.now();

  // Wrap the LLM to record per-call timing/success only (never prompts or secrets).
  const calls: LlmCallMetric[] = [];
  const llm: Pick<LlmClient, 'callJSON'> = {
    callJSON: async (opts) => {
      const t = Date.now();
      try {
        const r = await options.llm.callJSON(opts);
        calls.push({ success: true, duration_ms: Date.now() - t });
        return r;
      } catch (err) {
        calls.push({ success: false, duration_ms: Date.now() - t });
        throw err;
      }
    },
  };

  const stageMarks: { stage: PipelineStage; at: number }[] = [];
  let extractionRole: ExtractedRole | undefined;
  let companyResearch: CompanyResearch | undefined;
  let interviewResearch: InterviewResearch | undefined;
  let interviewDiagnostics: InterviewResearchDiagnostics | undefined;
  let companyBrief: CompanyBrief | undefined;
  let initial: { questions: Question[]; flashcards: Flashcard[] } | undefined;
  const passesDetail: CoveragePassInfo[] = [];
  let coverageFinal: { coverage: Coverage } | undefined;

  const onArtifact = (a: PipelineArtifact): void => {
    switch (a.type) {
      case 'extraction':
        extractionRole = a.role;
        break;
      case 'company-research':
        companyResearch = a.research;
        break;
      case 'interview-research':
        interviewResearch = a.research;
        break;
      case 'interview-research-diagnostics':
        interviewDiagnostics = a.diagnostics;
        break;
      case 'company-brief':
        companyBrief = a.brief;
        break;
      case 'initial-generation':
        initial = { questions: a.questions, flashcards: a.flashcards };
        break;
      case 'coverage-pass':
        passesDetail.push(a.info);
        break;
      case 'coverage-final':
        coverageFinal = { coverage: a.coverage };
        break;
      case 'schedule':
        break; // captured from the final kit
    }
  };

  let finalKit: Kit | null = null;
  let error: { code: string; message: string } | null = null;

  try {
    const result = await runPipeline(
      { jd: c.jd, companyUrl: c.company_url, days: c.days },
      {
        llm,
        searchProvider: options.searchProvider,
        fetchFn: options.fetchFn,
        allowLocal: options.allowLocal,
        onProgress: (s) => stageMarks.push({ stage: s, at: Date.now() }),
        onArtifact,
      },
    );
    finalKit = result.kit;
  } catch (err) {
    error = {
      code: err instanceof PipelineError ? err.code : 'PIPELINE_ERROR',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const finishedAt = Date.now();

  // Reconstruct per-stage timing from the ordered onProgress marks. A stage ends
  // when the next stage starts; the last stage ends at completion, or is the
  // failing stage when the run threw.
  const stages: StageTiming[] = stageMarks.map((m, i) => {
    const next = stageMarks[i + 1];
    const end = next ? next.at : error ? null : finishedAt;
    const failedHere = Boolean(error) && i === stageMarks.length - 1 && m.stage !== 'done';
    return {
      stage: m.stage,
      started_at: new Date(m.at).toISOString(),
      finished_at: end !== null ? new Date(end).toISOString() : null,
      duration_ms: end !== null ? end - m.at : null,
      status: failedHere ? 'failed' : 'ok',
      error: failedHere ? error?.message ?? null : null,
    };
  });

  const retrieval: RetrievalEvidence | null = companyResearch
    ? {
        company_url: companyResearch.company_url,
        pages_used: companyResearch.pages_used,
        homepage: companyResearch.homepage ? toPageEvidence(companyResearch.homepage) : null,
        hiring_pages: companyResearch.hiringPages.map(toPageEvidence),
        other_pages: companyResearch.otherPages.map(toPageEvidence),
        skipped: companyResearch.skipped,
      }
    : null;

  return {
    id: c.id,
    company_url: c.company_url,
    role: c.role ?? null,
    requested_days: c.days,
    status: error ? 'failed' : 'ok',
    timing: {
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: finishedAt - startedAt,
    },
    stages,
    extraction: extractionRole
      ? {
          title: extractionRole.title,
          seniority: extractionRole.seniority,
          responsibilities: extractionRole.responsibilities,
          requirements: extractionRole.requirements.map((r) => ({
            id: r.id,
            text: r.text,
            kind: r.kind,
            priority: r.priority,
          })),
        }
      : null,
    retrieval,
    interview_research: interviewResearch ?? null,
    interview_research_diagnostics: interviewDiagnostics ?? null,
    company_brief: companyBrief ?? null,
    initial_generation: initial
      ? { initial_questions: initial.questions, flashcards: initial.flashcards }
      : null,
    coverage: coverageFinal
      ? {
          passes: coverageFinal.coverage.passes,
          uncovered_requirement_ids: coverageFinal.coverage.uncovered_requirement_ids,
          passes_detail: passesDetail,
        }
      : null,
    schedule: finalKit ? finalKit.schedule.days : null,
    checks: finalKit ? computeChecks(finalKit) : null,
    requirement_question_trace: finalKit ? buildTrace(finalKit) : null,
    llm: {
      model: options.model,
      call_count: calls.length,
      total_duration_ms: calls.reduce((s, x) => s + x.duration_ms, 0),
      calls,
    },
    final_kit: finalKit,
    error,
  };
}
