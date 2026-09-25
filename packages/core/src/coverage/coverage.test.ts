import { describe, it, expect } from 'vitest';
import { findGaps, runCoverageLoop } from './coverage.js';
import { validateKit } from '../kit/index.js';
import type { Question, Requirement } from '../kit/schema.js';

const REQS: Requirement[] = [
  { id: 'r1', text: 'Node', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'Redis', kind: 'technical', priority: 'nice' },
];

function q(id: string, requirement_ids: string[]): Question {
  return { id, requirement_ids, category: 'technical', prompt: 'P', answer_outline: 'A', difficulty: 2 };
}

describe('findGaps (pure, deterministic)', () => {
  it('returns [] when every must-have is covered', () => {
    expect(findGaps(REQS, [q('q1', ['r1']), q('q2', ['r2'])])).toEqual([]);
  });

  it('detects an uncovered must-have', () => {
    expect(findGaps(REQS, [q('q1', ['r1'])])).toEqual(['r2']);
  });

  it('ignores uncovered NICE requirements (only must-haves are gaps)', () => {
    // r3 is nice and uncovered, but not a gap.
    expect(findGaps(REQS, [q('q1', ['r1']), q('q2', ['r2'])])).toEqual([]);
  });
});

describe('runCoverageLoop', () => {
  it('closes a gap on the second pass', async () => {
    const result = await runCoverageLoop({
      requirements: REQS,
      questions: [q('q1', ['r1'])], // r2 uncovered
      fillGaps: async (missing) => missing.map((r) => q('new', [r.id])),
    });
    expect(result.coverage.uncovered_requirement_ids).toEqual([]);
    expect(result.coverage.passes).toBe(2);
    // ids re-assigned sequentially, unique
    expect(result.questions.map((x) => x.id)).toEqual(['q1', 'q2']);
  });

  it('stops early and records the gap honestly when a pass makes no progress', async () => {
    const result = await runCoverageLoop({
      requirements: REQS,
      questions: [q('q1', ['r1'])], // r2 uncovered
      fillGaps: async () => [], // never closes the gap
    });
    expect(result.coverage.uncovered_requirement_ids).toEqual(['r2']);
    expect(result.coverage.passes).toBe(2); // attempted once, then stopped
  });

  it('respects the pass cap even while making progress', async () => {
    const reqs: Requirement[] = [
      { id: 'r1', text: 'a', kind: 'technical', priority: 'must' },
      { id: 'r2', text: 'b', kind: 'technical', priority: 'must' },
      { id: 'r3', text: 'c', kind: 'technical', priority: 'must' },
    ];
    // Closes exactly one gap per pass → r3 remains when the 3-pass cap is hit.
    const result = await runCoverageLoop({
      requirements: reqs,
      questions: [], // all three uncovered
      fillGaps: async (missing) => [q('n', [missing[0].id])],
      maxPasses: 3,
    });
    expect(result.coverage.passes).toBe(3);
    expect(result.coverage.uncovered_requirement_ids).toEqual(['r3']);
  });

  it('produces questions + coverage that validate inside a kit', async () => {
    const result = await runCoverageLoop({
      requirements: REQS,
      questions: [q('q1', ['r1'])],
      fillGaps: async (missing) => missing.map((r) => q('new', [r.id])),
    });
    const kit = {
      source: { company: '', company_url: '', role: '', location: '', jd_chars: 0, researched_at: '', pages_used: [] },
      company_brief: { summary: '', what_they_do: '', sources: [] },
      role: { title: '', seniority: '', responsibilities: [], requirements: REQS },
      questions: result.questions,
      flashcards: [],
      schedule: { days_available: 1, days: [{ day: 1, focus: '', question_ids: [], minutes: 0 }] },
      coverage: result.coverage,
    };
    expect(validateKit(kit).ok).toBe(true);
  });
});
