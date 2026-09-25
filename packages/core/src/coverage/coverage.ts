import type { Coverage, Question, Requirement } from '../kit/schema.js';

/**
 * Pure, deterministic gap detection — NOT the model's job. Returns the ids of
 * every MUST-have requirement that no question references. This is exactly the
 * comparison the brief says belongs in code: "comparing the extracted
 * requirements against the generated questions to find the gaps is your code's
 * decision to make, not the model's."
 */
export function findGaps(requirements: Requirement[], questions: Question[]): string[] {
  const covered = new Set<string>();
  for (const q of questions) {
    for (const id of q.requirement_ids) covered.add(id);
  }
  return requirements.filter((r) => r.priority === 'must' && !covered.has(r.id)).map((r) => r.id);
}

/** Per-pass detail, emitted for observability (does not affect behaviour). */
export interface CoveragePassInfo {
  pass: number;
  missingBefore: string[];
  generated: Question[];
  missingAfter: string[];
}

export interface RunCoverageInput {
  requirements: Requirement[];
  /** The first-draft questions (this counts as pass 1). */
  questions: Question[];
  /** Targeted regeneration for the given missing requirements. The only LLM part. */
  fillGaps: (missing: Requirement[]) => Promise<Question[]>;
  /** Total passes allowed, including the initial draft. Default 3. */
  maxPasses?: number;
  /** Optional observability hook, called once per gap-closing pass. */
  onPass?: (info: CoveragePassInfo) => void;
}

export interface CoverageResult {
  questions: Question[];
  coverage: Coverage;
}

/**
 * Force a second pass (and a third) to close coverage gaps. After the first
 * draft, compare questions to must-have requirements; for any gap, ask the
 * injected `fillGaps` to generate the missing questions, then check again.
 *
 * Bounded to `maxPasses` total, with an EARLY STOP if a pass closes no new gaps
 * (looping further just burns free-tier tokens). If a must-have still cannot be
 * covered, it is recorded honestly in `coverage.uncovered_requirement_ids`
 * rather than fabricated or looped forever. Question ids are re-assigned
 * sequentially at the end so the merged bank has stable, unique ids.
 */
export async function runCoverageLoop(input: RunCoverageInput): Promise<CoverageResult> {
  const maxPasses = input.maxPasses ?? 3;
  let questions = [...input.questions];
  let passes = 1; // the initial draft is pass 1
  let gaps = findGaps(input.requirements, questions);

  while (gaps.length > 0 && passes < maxPasses) {
    const missingBefore = gaps;
    const missing = input.requirements.filter((r) => missingBefore.includes(r.id));
    const added = await input.fillGaps(missing);
    questions = questions.concat(added);
    passes++;
    const missingAfter = findGaps(input.requirements, questions);
    input.onPass?.({ pass: passes, missingBefore, generated: added, missingAfter });
    gaps = missingAfter;
    if (missingAfter.length >= missingBefore.length) break; // no progress → stop
  }

  questions = questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));
  return { questions, coverage: { uncovered_requirement_ids: gaps, passes } };
}
