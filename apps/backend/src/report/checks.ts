import { findGaps, validateKit, type Kit } from '@interview-prep-kit/core';
import type { DeterministicChecks, TraceEntry } from './types.js';

/** Ids that appear more than once in a list. */
function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/**
 * Compute deterministic checks over a final kit — NO LLM involved. These let an
 * independent reviewer verify structure and coverage without trusting our word.
 */
export function computeChecks(kit: Kit): DeterministicChecks {
  const requirements = kit.role.requirements;
  const reqIds = new Set(requirements.map((r) => r.id));
  const qIds = new Set(kit.questions.map((q) => q.id));

  const invalidRequirementRefs = new Set<string>();
  const questionsMissingLinks: string[] = [];
  for (const q of kit.questions) {
    if (q.requirement_ids.length === 0) questionsMissingLinks.push(q.id);
    for (const rid of q.requirement_ids) if (!reqIds.has(rid)) invalidRequirementRefs.add(rid);
  }

  const scheduleQuestionIds = kit.schedule.days.flatMap((d) => d.question_ids);
  const invalidQuestionRefs = new Set<string>();
  for (const qid of scheduleQuestionIds) if (!qIds.has(qid)) invalidQuestionRefs.add(qid);

  const scheduledSet = new Set(scheduleQuestionIds);
  const scheduleMissing = [...qIds].filter((id) => !scheduledSet.has(id));

  const uncovered = findGaps(requirements, kit.questions);

  return {
    structure_valid: validateKit(kit).ok,
    requirement_count: requirements.length,
    must_requirement_count: requirements.filter((r) => r.priority === 'must').length,
    nice_requirement_count: requirements.filter((r) => r.priority === 'nice').length,
    question_count: kit.questions.length,
    flashcard_count: kit.flashcards.length,
    schedule_day_count: kit.schedule.days.length,
    schedule_question_count: scheduleQuestionIds.length,
    uncovered_must_requirements: uncovered,
    duplicate_question_ids: duplicates(kit.questions.map((q) => q.id)),
    duplicate_requirement_ids: duplicates(requirements.map((r) => r.id)),
    invalid_requirement_references: [...invalidRequirementRefs],
    invalid_question_references: [...invalidQuestionRefs],
    questions_missing_requirement_links: questionsMissingLinks,
    schedule_missing_question_ids: scheduleMissing,
    schedule_duplicate_question_ids: duplicates(scheduleQuestionIds),
    all_must_haves_covered: uncovered.length === 0,
  };
}

/** For every requirement, the ids of the questions that reference it. */
export function buildTrace(kit: Kit): TraceEntry[] {
  const byRequirement = new Map<string, string[]>();
  for (const q of kit.questions) {
    for (const rid of q.requirement_ids) {
      const list = byRequirement.get(rid) ?? [];
      list.push(q.id);
      byRequirement.set(rid, list);
    }
  }
  return kit.role.requirements.map((r) => ({
    requirement_id: r.id,
    requirement_text: r.text,
    priority: r.priority,
    kind: r.kind,
    question_ids: byRequirement.get(r.id) ?? [],
  }));
}
