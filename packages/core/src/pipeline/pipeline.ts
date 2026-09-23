import { runCoverageLoop } from '../coverage/index.js';
import { extractRequirements } from '../extraction/index.js';
import { generateCompanyBrief, generateFlashcards, generateQuestions } from '../generation/index.js';
import { researchInterviewProcess, type SearchProvider } from '../interview-research/index.js';
import { validateKit, type Kit } from '../kit/index.js';
import type { LlmClient } from '../llm/index.js';
import { crawlCompany, type CompanyResearch, type SkippedSource } from '../retrieval/index.js';
import { allocateSchedule } from '../schedule/index.js';
import type { FetchFn } from '../shared/http.js';

export type PipelineStage =
  | 'extracting'
  | 'crawling'
  | 'interview-research'
  | 'generating'
  | 'covering'
  | 'scheduling'
  | 'validating'
  | 'done';

export interface PipelineInput {
  jd: string;
  companyUrl: string;
  /** Optional; derived from the URL host when omitted. */
  companyName?: string;
  days: number;
}

export interface PipelineOptions {
  llm: Pick<LlmClient, 'callJSON'>;
  /** Search backend for interview research. Absent → honest "no info". */
  searchProvider?: SearchProvider;
  /** Injected fetch for crawler + research (tests). */
  fetchFn?: FetchFn;
  /** Allow localhost targets (Section 9 batch). Default false. */
  allowLocal?: boolean;
  onProgress?: (stage: PipelineStage, detail?: string) => void;
  maxPasses?: number;
  maxPerRequirement?: number;
}

export interface PipelineResult {
  kit: Kit;
  /** Sources skipped during retrieval, surfaced for the UI. */
  skipped: SkippedSource[];
}

/** A structured, coded failure the batch/backend can record and report. */
export class PipelineError extends Error {
  constructor(
    readonly code: 'EXTRACTION_FAILED' | 'GENERATION_FAILED' | 'INVALID_KIT',
    message: string,
  ) {
    super(message);
    this.name = 'PipelineError';
  }
}

function deriveCompanyName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const label = host.split('.')[0] ?? host;
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
  } catch {
    return '';
  }
}

/**
 * Run the full research → generation → validation pipeline on one case, in the
 * genuine sequence the brief demands: the pasted JD is extracted with no
 * retrieval; the company URL is crawled; public interview discussion is
 * researched; generation is fed by BOTH so the kit reflects what was found; the
 * deterministic coverage loop closes gaps (using real targeted regeneration); the
 * deterministic scheduler allocates the days; and the kit is validated before it
 * is returned. Retrieval failures are recorded, never fatal.
 */
export async function runPipeline(
  input: PipelineInput,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const emit = options.onProgress ?? ((): void => {});
  const companyName = input.companyName?.trim() || deriveCompanyName(input.companyUrl);

  // 1. Extract requirements from the pasted JD (no retrieval).
  emit('extracting');
  let role;
  try {
    role = await extractRequirements(input.jd, { llm: options.llm });
  } catch (err) {
    throw new PipelineError('EXTRACTION_FAILED', err instanceof Error ? err.message : String(err));
  }

  // 2. Crawl the company site (honest empty result on failure, never throws).
  emit('crawling');
  let companyResearch: CompanyResearch;
  try {
    companyResearch = await crawlCompany(input.companyUrl, {
      fetchFn: options.fetchFn,
      allowLocal: options.allowLocal,
    });
  } catch (err) {
    companyResearch = {
      company_url: input.companyUrl,
      pages_used: [],
      skipped: [{ url: input.companyUrl, reason: err instanceof Error ? err.message : 'crawl failed' }],
      hiringPages: [],
      otherPages: [],
    };
  }

  // 3. Research public interview discussion (honest "not found" without a provider).
  emit('interview-research');
  const interviewResearch = await researchInterviewProcess(
    { name: companyName, url: input.companyUrl },
    {
      searchProvider: options.searchProvider,
      llm: options.llm,
      fetchFn: options.fetchFn,
      allowLocal: options.allowLocal,
    },
  );

  // 4. Generate brief + questions + flashcards, fed by the research above.
  emit('generating');
  let brief;
  let questions;
  let flashcards;
  try {
    brief = await generateCompanyBrief({ companyName, research: companyResearch }, { llm: options.llm });
    questions = await generateQuestions(
      { role, companyResearch, interviewResearch },
      { llm: options.llm, maxPerRequirement: options.maxPerRequirement },
    );
    flashcards = await generateFlashcards({ role }, { llm: options.llm });
  } catch (err) {
    throw new PipelineError('GENERATION_FAILED', err instanceof Error ? err.message : String(err));
  }

  // 5. Deterministic coverage loop — targeted regeneration closes must-have gaps.
  emit('covering');
  const covered = await runCoverageLoop({
    requirements: role.requirements,
    questions,
    maxPasses: options.maxPasses,
    fillGaps: (missing) =>
      generateQuestions(
        { role: { title: role.title, requirements: missing }, companyResearch, interviewResearch },
        { llm: options.llm, maxPerRequirement: options.maxPerRequirement },
      ),
  });

  // 6. Deterministic schedule allocation across exactly `days` days.
  emit('scheduling');
  const schedule = allocateSchedule(covered.questions, role.requirements, input.days);

  // 7. Assemble and validate the kit before returning it.
  emit('validating');
  const kit = {
    source: {
      company: companyName,
      company_url: input.companyUrl,
      role: role.title,
      location: '',
      jd_chars: input.jd.length,
      researched_at: new Date().toISOString(),
      pages_used: companyResearch.pages_used,
    },
    company_brief: brief,
    role,
    questions: covered.questions,
    flashcards,
    schedule,
    coverage: covered.coverage,
  };

  const result = validateKit(kit);
  if (!result.ok) {
    throw new PipelineError(
      'INVALID_KIT',
      result.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    );
  }

  emit('done');
  return { kit: result.kit, skipped: companyResearch.skipped };
}
