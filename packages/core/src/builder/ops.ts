import { findGaps } from '../coverage/index.js';
import type { Flashcard, Kit, Question, QuestionCategory } from '../kit/schema.js';
import { allocateSchedule } from '../schedule/index.js';
import { isProtected } from './state.js';

/** Section identifiers the builder can regenerate independently. */
export type KitSection = QuestionCategory | 'flashcards' | 'company_brief' | 'schedule';

export interface GeneratedQuestion {
  requirement_ids: string[];
  prompt: string;
  answer_outline: string;
  difficulty: number;
}
export interface GeneratedFlashcard {
  front: string;
  back: string;
  requirement_ids: string[];
}

function clone(kit: Kit): Kit {
  return structuredClone(kit);
}
function nextId(prefix: string, existing: string[]): (n?: number) => string {
  let max = 0;
  for (const id of existing) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return () => `${prefix}${++max}`;
}

/**
 * Restore referential integrity + coverage after any change to the question set:
 * prune schedule references to questions that no longer exist (keeping the kit
 * valid and preserving the user's schedule edits), and recompute the deterministic
 * coverage gaps. It does NOT re-allocate the schedule — that is the explicit
 * `regenerateSchedule` op, so editing questions never silently discards a
 * hand-edited schedule.
 */
function finalize(kit: Kit): Kit {
  const questionIds = new Set(kit.questions.map((q) => q.id));
  kit.schedule.days = kit.schedule.days.map((d) => ({
    ...d,
    question_ids: d.question_ids.filter((id) => questionIds.has(id)),
  }));
  kit.coverage = {
    ...kit.coverage,
    uncovered_requirement_ids: findGaps(kit.role.requirements, kit.questions),
  };
  return kit;
}

// ── Question item operations ──

export function editQuestion(
  kit: Kit,
  id: string,
  patch: Partial<Pick<Question, 'prompt' | 'answer_outline' | 'difficulty' | 'requirement_ids'>>,
): Kit {
  const next = clone(kit);
  next.questions = next.questions.map((q) => {
    if (q.id !== id) return q;
    // A user edit protects the item: origin:generated → state:edited; a user-added
    // item stays user-owned (already protected).
    const state = q.origin === 'user' ? q.state : 'edited';
    return { ...q, ...patch, state };
  });
  return finalize(next);
}

export function addQuestion(
  kit: Kit,
  input: { category: QuestionCategory; requirement_ids: string[]; prompt: string; answer_outline: string; difficulty: number },
): Kit {
  const next = clone(kit);
  const id = nextId('q', next.questions.map((q) => q.id))();
  const maxOrder = next.questions.reduce((m, q) => Math.max(m, Number(q.order ?? 0)), 0);
  next.questions.push({
    id,
    requirement_ids: input.requirement_ids,
    category: input.category,
    prompt: input.prompt,
    answer_outline: input.answer_outline,
    difficulty: input.difficulty,
    origin: 'user',
    state: 'pinned',
    order: maxOrder + 1,
  });
  return finalize(next);
}

export function deleteQuestion(kit: Kit, id: string): Kit {
  const next = clone(kit);
  next.questions = next.questions.filter((q) => q.id !== id);
  return finalize(next);
}

export function moveQuestion(kit: Kit, id: string, category: QuestionCategory): Kit {
  const next = clone(kit);
  next.questions = next.questions.map((q) =>
    q.id === id ? { ...q, category, state: q.origin === 'user' ? q.state : 'edited' } : q,
  );
  return finalize(next);
}

export function reorderCategory(kit: Kit, category: QuestionCategory, orderedIds: string[]): Kit {
  const next = clone(kit);
  const position = new Map(orderedIds.map((id, i) => [id, i]));
  next.questions = next.questions.map((q) =>
    q.category === category && position.has(q.id) ? { ...q, order: position.get(q.id) } : q,
  );
  return finalize(next);
}

export function setQuestionPinned(kit: Kit, id: string, pinned: boolean): Kit {
  const next = clone(kit);
  next.questions = next.questions.map((q) =>
    q.id === id ? { ...q, state: pinned ? 'pinned' : q.state === 'pinned' ? 'generated' : q.state } : q,
  );
  return next;
}

/**
 * Regenerate ONE question category: keep every protected item in that category,
 * drop the old generated ones, and insert the freshly generated questions (new
 * ids, origin:generated, state:generated). Other categories are untouched, and a
 * deleted question cannot resurrect because new items get new ids.
 */
export function regenerateQuestionCategory(
  kit: Kit,
  category: QuestionCategory,
  generated: GeneratedQuestion[],
): Kit {
  const next = clone(kit);
  const mint = nextId('q', next.questions.map((q) => q.id));
  const others = next.questions.filter((q) => q.category !== category);
  const keep = next.questions.filter((q) => q.category === category && isProtected(q));
  const fresh: Question[] = generated.map((g) => ({
    id: mint(),
    requirement_ids: g.requirement_ids,
    category,
    prompt: g.prompt,
    answer_outline: g.answer_outline,
    difficulty: g.difficulty,
    origin: 'generated',
    state: 'generated',
  }));
  next.questions = [...others, ...keep, ...fresh];
  return finalize(next);
}

// ── Flashcard operations ──

export function addFlashcard(kit: Kit, input: { front: string; back: string; requirement_ids: string[] }): Kit {
  const next = clone(kit);
  const id = nextId('f', next.flashcards.map((f) => f.id))();
  next.flashcards.push({ ...input, id, origin: 'user', state: 'pinned' });
  return next;
}

export function editFlashcard(kit: Kit, id: string, patch: Partial<Pick<Flashcard, 'front' | 'back' | 'requirement_ids'>>): Kit {
  const next = clone(kit);
  next.flashcards = next.flashcards.map((f) =>
    f.id === id ? { ...f, ...patch, state: f.origin === 'user' ? f.state : 'edited' } : f,
  );
  return next;
}

export function deleteFlashcard(kit: Kit, id: string): Kit {
  const next = clone(kit);
  next.flashcards = next.flashcards.filter((f) => f.id !== id);
  return next;
}

export function regenerateFlashcards(kit: Kit, generated: GeneratedFlashcard[]): Kit {
  const next = clone(kit);
  const mint = nextId('f', next.flashcards.map((f) => f.id));
  const keep = next.flashcards.filter((f) => isProtected(f));
  const fresh: Flashcard[] = generated.map((g) => ({
    id: mint(),
    front: g.front,
    back: g.back,
    requirement_ids: g.requirement_ids,
    origin: 'generated',
    state: 'generated',
  }));
  next.flashcards = [...keep, ...fresh];
  return next;
}

// ── Company brief ──

export function editBrief(kit: Kit, patch: { summary?: string; what_they_do?: string }): Kit {
  const next = clone(kit);
  next.company_brief = { ...next.company_brief, ...patch, state: 'edited' };
  return next;
}

/** Regenerate the brief only if the user has not edited/pinned it. */
export function regenerateBrief(kit: Kit, generated: { summary: string; what_they_do: string; sources: string[] }): Kit {
  const next = clone(kit);
  if (isProtected(next.company_brief)) return next; // preserve the user's edit
  next.company_brief = { ...generated, state: 'generated' };
  return next;
}

// ── Schedule (deterministic re-allocation) ──

export function regenerateSchedule(kit: Kit): Kit {
  const next = clone(kit);
  next.schedule = allocateSchedule(next.questions, next.role.requirements, next.schedule.days_available);
  return finalize(next);
}
