import { describe, it, expect } from 'vitest';
import { allocateSchedule } from './schedule.js';
import { validateKit } from '../kit/index.js';
import type { Question, Requirement } from '../kit/schema.js';

const REQS: Requirement[] = [
  { id: 'r1', text: 'a', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'b', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'c', kind: 'technical', priority: 'nice' },
];

/** Build N questions with cycling difficulty, each covering one requirement. */
function makeQuestions(n: number): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    requirement_ids: [REQS[i % REQS.length].id],
    category: 'technical' as const,
    prompt: 'P',
    answer_outline: 'A',
    difficulty: ((i % 3) + 1) as 1 | 2 | 3,
  }));
}

function avgDifficulty(ids: string[], byId: Map<string, Question>): number {
  if (ids.length === 0) return 0;
  return ids.reduce((s, id) => s + (byId.get(id)?.difficulty ?? 0), 0) / ids.length;
}

describe('allocateSchedule — invariants', () => {
  for (const days of [1, 3, 7, 60]) {
    it(`spans exactly ${days} day(s) with unique, in-range day numbers`, () => {
      const schedule = allocateSchedule(makeQuestions(8), REQS, days);
      expect(schedule.days_available).toBe(days);
      expect(schedule.days).toHaveLength(days);
      expect(schedule.days.map((d) => d.day)).toEqual(
        Array.from({ length: days }, (_, i) => i + 1),
      );
    });
  }

  it('places every question exactly once (none lost or duplicated)', () => {
    const questions = makeQuestions(8);
    const schedule = allocateSchedule(questions, REQS, 3);
    const placed = schedule.days.flatMap((d) => d.question_ids).sort();
    expect(placed).toEqual(questions.map((q) => q.id).sort());
  });

  it('makes every must-have requirement appear somewhere in the schedule', () => {
    const questions = makeQuestions(6);
    const schedule = allocateSchedule(questions, REQS, 4);
    const byId = new Map(questions.map((q) => [q.id, q] as const));
    const covered = new Set<string>();
    for (const d of schedule.days) {
      for (const qid of d.question_ids) {
        for (const rid of byId.get(qid)!.requirement_ids) covered.add(rid);
      }
    }
    for (const r of REQS.filter((x) => x.priority === 'must')) {
      expect(covered.has(r.id)).toBe(true);
    }
  });

  it('front-loads by difficulty when priority is equal (all must-have)', () => {
    // All must-have, so difficulty is the sole differentiator.
    const questions: Question[] = Array.from({ length: 9 }, (_, i) => ({
      id: `q${i + 1}`,
      requirement_ids: ['r1'],
      category: 'technical' as const,
      prompt: 'P',
      answer_outline: 'A',
      difficulty: ((i % 3) + 1) as 1 | 2 | 3,
    }));
    const schedule = allocateSchedule(questions, REQS, 3);
    const byId = new Map(questions.map((q) => [q.id, q] as const));
    const first = avgDifficulty(schedule.days[0].question_ids, byId);
    const lastNonEmpty = [...schedule.days].reverse().find((d) => d.question_ids.length > 0)!;
    expect(first).toBeGreaterThanOrEqual(avgDifficulty(lastNonEmpty.question_ids, byId));
  });

  it('schedules a must-have before a harder nice-to-have (priority outranks difficulty)', () => {
    const questions: Question[] = [
      { id: 'qNiceHard', requirement_ids: ['r3'], category: 'technical', prompt: 'P', answer_outline: 'A', difficulty: 3 },
      { id: 'qMustEasy', requirement_ids: ['r1'], category: 'technical', prompt: 'P', answer_outline: 'A', difficulty: 1 },
    ];
    const schedule = allocateSchedule(questions, REQS, 2);
    expect(schedule.days[0].question_ids).toContain('qMustEasy'); // must-have first
    expect(schedule.days[1].question_ids).toContain('qNiceHard'); // hard nice-to-have last
  });

  it('uses integer minutes on every day', () => {
    const schedule = allocateSchedule(makeQuestions(8), REQS, 5);
    for (const d of schedule.days) expect(Number.isInteger(d.minutes)).toBe(true);
  });

  it('handles a 1-day plan by putting everything on day 1', () => {
    const questions = makeQuestions(5);
    const schedule = allocateSchedule(questions, REQS, 1);
    expect(schedule.days[0].question_ids).toHaveLength(5);
  });

  it('handles a 60-day plan with few questions (spread, must-haves still present)', () => {
    const schedule = allocateSchedule(makeQuestions(5), REQS, 60);
    expect(schedule.days).toHaveLength(60);
    const totalPlaced = schedule.days.reduce((n, d) => n + d.question_ids.length, 0);
    expect(totalPlaced).toBe(5);
  });

  it('rejects invalid day counts instead of silently coercing them', () => {
    expect(() => allocateSchedule(makeQuestions(3), REQS, 0)).toThrow(RangeError);
    expect(() => allocateSchedule(makeQuestions(3), REQS, -2)).toThrow(RangeError);
    expect(() => allocateSchedule(makeQuestions(3), REQS, 3.5)).toThrow(RangeError);
    expect(() => allocateSchedule(makeQuestions(3), REQS, Number.NaN)).toThrow(RangeError);
  });

  it('returns exactly N empty days (valid integer minutes) when there are no questions', () => {
    const schedule = allocateSchedule([], REQS, 5);
    expect(schedule.days).toHaveLength(5);
    for (const d of schedule.days) {
      expect(d.question_ids).toEqual([]);
      expect(d.minutes).toBe(0);
      expect(Number.isInteger(d.minutes)).toBe(true);
    }
  });
});

describe('allocateSchedule — integration', () => {
  it('produces a schedule that validates inside a kit (referential integrity)', () => {
    const questions = makeQuestions(7);
    const schedule = allocateSchedule(questions, REQS, 4);
    const kit = {
      source: { company: '', company_url: '', role: '', location: '', jd_chars: 0, researched_at: '', pages_used: [] },
      company_brief: { summary: '', what_they_do: '', sources: [] },
      role: { title: '', seniority: '', responsibilities: [], requirements: REQS },
      questions,
      flashcards: [],
      schedule,
      coverage: { uncovered_requirement_ids: [], passes: 1 },
    };
    expect(validateKit(kit).ok).toBe(true);
  });
});
