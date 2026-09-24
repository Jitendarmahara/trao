import { describe, it, expect } from 'vitest';
import { validateKit, type Kit } from '../kit/index.js';
import { isProtected } from './state.js';
import {
  addFlashcard,
  addQuestion,
  deleteQuestion,
  editBrief,
  editFlashcard,
  editQuestion,
  moveQuestion,
  regenerateBrief,
  regenerateFlashcards,
  regenerateQuestionCategory,
  regenerateSchedule,
  reorderCategory,
  setQuestionPinned,
} from './ops.js';

function baseKit(): Kit {
  return {
    source: { company: 'Acme', company_url: 'x', role: '', location: '', jd_chars: 0, researched_at: '', pages_used: [] },
    company_brief: { summary: 'orig', what_they_do: 'orig', sources: [] },
    role: {
      title: '',
      seniority: '',
      responsibilities: [],
      requirements: [
        { id: 'r1', text: 'Node', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'must' },
      ],
    },
    questions: [
      { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'P1', answer_outline: 'A', difficulty: 2, origin: 'generated', state: 'generated' },
      { id: 'q2', requirement_ids: ['r2'], category: 'behavioural', prompt: 'P2', answer_outline: 'A', difficulty: 1, origin: 'generated', state: 'generated' },
    ],
    flashcards: [{ id: 'f1', front: 'F', back: 'B', requirement_ids: ['r1'], origin: 'generated', state: 'generated' }],
    schedule: { days_available: 1, days: [{ day: 1, focus: '', question_ids: ['q1', 'q2'], minutes: 60 }] },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  } as Kit;
}
const NEW = { requirement_ids: ['r1'], prompt: 'NEW', answer_outline: 'A', difficulty: 3 };
const findQ = (kit: Kit, id: string) => kit.questions.find((q) => q.id === id);

describe('regenerate question category — preserve edits', () => {
  it('replaces a plain generated question', () => {
    const kit = regenerateQuestionCategory(baseKit(), 'technical', [NEW]);
    expect(findQ(kit, 'q1')).toBeUndefined(); // generated → replaced
    expect(kit.questions.some((q) => q.prompt === 'NEW')).toBe(true);
    expect(validateKit(kit).ok).toBe(true);
  });

  it('an EDITED question survives regeneration of its category', () => {
    let kit = editQuestion(baseKit(), 'q1', { prompt: 'EDITED' });
    kit = regenerateQuestionCategory(kit, 'technical', [NEW]);
    expect(findQ(kit, 'q1')?.prompt).toBe('EDITED');
    expect(kit.questions.some((q) => q.prompt === 'NEW')).toBe(true);
  });

  it('a PINNED question survives', () => {
    let kit = setQuestionPinned(baseKit(), 'q1', true);
    kit = regenerateQuestionCategory(kit, 'technical', []);
    expect(findQ(kit, 'q1')).toBeDefined();
  });

  it('a USER-added question survives', () => {
    let kit = addQuestion(baseKit(), { category: 'technical', requirement_ids: ['r1'], prompt: 'MINE', answer_outline: '', difficulty: 2 });
    const mineId = kit.questions.find((q) => q.prompt === 'MINE')!.id;
    kit = regenerateQuestionCategory(kit, 'technical', [NEW]);
    expect(findQ(kit, mineId)).toBeDefined();
  });

  it('does NOT touch other categories', () => {
    const kit = regenerateQuestionCategory(baseKit(), 'technical', [NEW]);
    expect(findQ(kit, 'q2')?.prompt).toBe('P2'); // behavioural untouched
  });

  it('a deleted question does not resurrect after regeneration', () => {
    let kit = deleteQuestion(baseKit(), 'q1');
    expect(findQ(kit, 'q1')).toBeUndefined();
    expect(kit.schedule.days[0].question_ids).not.toContain('q1'); // schedule pruned
    kit = regenerateQuestionCategory(kit, 'technical', [NEW]);
    expect(findQ(kit, 'q1')).toBeUndefined();
    expect(validateKit(kit).ok).toBe(true);
  });
});

describe('reorder + move persistence', () => {
  it('persists order and keeps it after regenerating a DIFFERENT category', () => {
    let kit = addQuestion(baseKit(), { category: 'technical', requirement_ids: ['r1'], prompt: 'qX', answer_outline: '', difficulty: 1 });
    const xid = kit.questions.find((q) => q.prompt === 'qX')!.id;
    kit = reorderCategory(kit, 'technical', [xid, 'q1']);
    expect(findQ(kit, xid)?.order).toBe(0);
    expect(findQ(kit, 'q1')?.order).toBe(1);
    kit = regenerateQuestionCategory(kit, 'behavioural', [{ requirement_ids: ['r2'], prompt: 'NEWB', answer_outline: '', difficulty: 1 }]);
    expect(findQ(kit, xid)?.order).toBe(0); // order preserved across the other-section regen
    expect(findQ(kit, 'q1')?.order).toBe(1);
  });

  it('moving a question between categories keeps its edited (protected) state', () => {
    let kit = editQuestion(baseKit(), 'q1', { prompt: 'E' });
    kit = moveQuestion(kit, 'q1', 'system-design');
    const q = findQ(kit, 'q1')!;
    expect(q.category).toBe('system-design');
    expect(isProtected(q as unknown as Record<string, unknown>)).toBe(true);
    expect(validateKit(kit).ok).toBe(true);
  });
});

describe('flashcards + brief', () => {
  it('an edited flashcard survives regeneration; brief edit is preserved', () => {
    let kit = editFlashcard(baseKit(), 'f1', { front: 'EF' });
    kit = regenerateFlashcards(kit, [{ front: 'NF', back: 'B', requirement_ids: ['r1'] }]);
    expect(kit.flashcards.find((f) => f.id === 'f1')?.front).toBe('EF');
    expect(kit.flashcards.some((f) => f.front === 'NF')).toBe(true);
    expect(validateKit(kit).ok).toBe(true);

    let k2 = editBrief(baseKit(), { summary: 'MINE' });
    k2 = regenerateBrief(k2, { summary: 'GEN', what_they_do: 'GEN', sources: [] });
    expect(k2.company_brief.summary).toBe('MINE'); // preserved

    const k3 = regenerateBrief(baseKit(), { summary: 'GEN', what_they_do: 'GENW', sources: ['s'] });
    expect(k3.company_brief.summary).toBe('GEN'); // replaced when not edited
  });

  it('a user-added flashcard survives regeneration', () => {
    let kit = addFlashcard(baseKit(), { front: 'MYF', back: 'B', requirement_ids: ['r1'] });
    kit = regenerateFlashcards(kit, [{ front: 'NF', back: 'B', requirement_ids: ['r1'] }]);
    expect(kit.flashcards.some((f) => f.front === 'MYF')).toBe(true);
  });
});

describe('kit stays valid after operations', () => {
  it('regenerateSchedule re-allocates deterministically and validates', () => {
    let kit = deleteQuestion(baseKit(), 'q1');
    kit = regenerateSchedule(kit);
    expect(validateKit(kit).ok).toBe(true);
    expect(kit.schedule.days_available).toBe(1);
  });
});
