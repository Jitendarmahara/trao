import type { Question, Requirement, Schedule, ScheduleDay } from '../kit/schema.js';

/** Rough study time per question: harder questions take longer. Integer minutes. */
const MINUTES_PER_DIFFICULTY = 20;
/** How much being a must-have outweighs difficulty when ordering. */
const MUST_BONUS = 10;

function prettyCategory(category: string): string {
  switch (category) {
    case 'system-design':
      return 'System design';
    case 'company-fit':
      return 'Company fit';
    case 'behavioural':
      return 'Behavioural';
    case 'technical':
      return 'Technical';
    default:
      return category;
  }
}

/** A short human focus label for a day, from the categories it contains. */
function computeFocus(bucket: Question[]): string {
  if (bucket.length === 0) return 'Review and consolidation';
  const counts = new Map<string, number>();
  for (const q of bucket) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  const byFrequency = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return byFrequency.slice(0, 2).map(prettyCategory).join(' & ');
}

/**
 * Deterministic schedule allocation — NOT the model's job. Distributes the
 * question ids across EXACTLY `days` days with these invariants:
 *  - the schedule spans exactly `days` days;
 *  - harder / higher-priority (must-have) questions land EARLIER, not the night
 *    before (questions are ordered hardest-first, then placed front-to-back);
 *  - every scheduled question appears exactly once, so every must-have that has a
 *    question appears somewhere in the schedule;
 *  - durations are integer minutes.
 *
 * The placement `floor(i * days / n)` both front-loads the hardest work and
 * spreads a small question set across the whole horizon (e.g. a 5-question,
 * 60-day plan studies periodically rather than cramming days 1-5).
 */
export function allocateSchedule(
  questions: Question[],
  requirements: Requirement[],
  days: number,
): Schedule {
  const dayCount = Math.max(1, Math.floor(days));
  const mustIds = new Set(requirements.filter((r) => r.priority === 'must').map((r) => r.id));

  const weight = (q: Question): number =>
    (q.requirement_ids.some((id) => mustIds.has(id)) ? MUST_BONUS : 0) + q.difficulty;

  // Order hardest / highest-priority first, stable on original index for ties.
  const ordered = questions
    .map((q, idx) => ({ q, idx }))
    .sort((a, b) => weight(b.q) - weight(a.q) || a.idx - b.idx)
    .map((x) => x.q);

  const n = ordered.length;
  const buckets: Question[][] = Array.from({ length: dayCount }, () => []);
  for (let i = 0; i < n; i++) {
    const day = Math.min(dayCount - 1, Math.floor((i * dayCount) / n));
    buckets[day].push(ordered[i]);
  }

  const scheduleDays: ScheduleDay[] = buckets.map((bucket, idx) => ({
    day: idx + 1,
    focus: computeFocus(bucket),
    question_ids: bucket.map((q) => q.id),
    minutes: bucket.reduce((sum, q) => sum + q.difficulty * MINUTES_PER_DIFFICULTY, 0),
  }));

  return { days_available: dayCount, days: scheduleDays };
}
