import { z } from 'zod';

/**
 * The exact kit structure from Appendix A of the assessment.
 *
 * This is the single source of truth for a kit's shape. Field names match the
 * appendix EXACTLY; the assessment runs our pipeline against unseen job
 * descriptions and checks the output against this structure, so it must not drift.
 *
 * We allow EXTRA fields (`.passthrough()`) because the brief permits extending the
 * structure "where that genuinely helps" — this lets our Builder metadata (item
 * origin/state/order, Step 11) ride alongside without breaking validation, while
 * every required field is still validated exactly.
 *
 * Integer-only numbers (`.int()`) enforce the brief's rule: "Durations are integer
 * minutes. No floats, no 'about an hour'." and "difficulty is 1 to 3".
 */

// ── Enums (named exactly as the appendix comments specify) ──
export const RequirementKind = z.enum(['technical', 'behavioural', 'domain']);
export const RequirementPriority = z.enum(['must', 'nice']);
export const QuestionCategory = z.enum([
  'technical',
  'behavioural',
  'system-design',
  'company-fit',
]);

// ── Leaf objects ──
export const SourceSchema = z
  .object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().nonnegative(),
    researched_at: z.string(),
    pages_used: z.array(z.string()),
  })
  .passthrough();

export const CompanyBriefSchema = z
  .object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  })
  .passthrough();

export const RequirementSchema = z
  .object({
    id: z.string().min(1),
    text: z.string(),
    kind: RequirementKind,
    priority: RequirementPriority,
  })
  .passthrough();

export const RoleSchema = z
  .object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(RequirementSchema),
  })
  .passthrough();

export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    requirement_ids: z.array(z.string()),
    category: QuestionCategory,
    prompt: z.string(),
    answer_outline: z.string(),
    difficulty: z.number().int().min(1).max(3),
  })
  .passthrough();

export const FlashcardSchema = z
  .object({
    id: z.string().min(1),
    front: z.string(),
    back: z.string(),
    requirement_ids: z.array(z.string()),
  })
  .passthrough();

export const ScheduleDaySchema = z
  .object({
    day: z.number().int().min(1),
    focus: z.string(),
    question_ids: z.array(z.string()),
    minutes: z.number().int().nonnegative(),
  })
  .passthrough();

export const ScheduleSchema = z
  .object({
    days_available: z.number().int().min(1),
    days: z.array(ScheduleDaySchema),
  })
  .passthrough();

export const CoverageSchema = z
  .object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().nonnegative(),
  })
  .passthrough();

// ── The full kit, with cross-field integrity checks ──
export const KitSchema = z
  .object({
    source: SourceSchema,
    company_brief: CompanyBriefSchema,
    role: RoleSchema,
    questions: z.array(QuestionSchema),
    flashcards: z.array(FlashcardSchema),
    schedule: ScheduleSchema,
    coverage: CoverageSchema,
  })
  .passthrough()
  .superRefine((kit, ctx) => {
    const issue = (path: (string | number)[], message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    };

    // Stable, unique requirement ids — and a lookup set for reference checks.
    const requirementIds = new Set<string>();
    kit.role.requirements.forEach((r, i) => {
      if (requirementIds.has(r.id)) {
        issue(['role', 'requirements', i, 'id'], `Duplicate requirement id "${r.id}"`);
      }
      requirementIds.add(r.id);
    });

    // Unique question ids.
    const questionIds = new Set<string>();
    kit.questions.forEach((q, i) => {
      if (questionIds.has(q.id)) {
        issue(['questions', i, 'id'], `Duplicate question id "${q.id}"`);
      }
      questionIds.add(q.id);
    });

    // Unique flashcard ids.
    const flashcardIds = new Set<string>();
    kit.flashcards.forEach((f, i) => {
      if (flashcardIds.has(f.id)) {
        issue(['flashcards', i, 'id'], `Duplicate flashcard id "${f.id}"`);
      }
      flashcardIds.add(f.id);
    });

    // Every question references requirement ids that exist.
    kit.questions.forEach((q, i) => {
      q.requirement_ids.forEach((rid, j) => {
        if (!requirementIds.has(rid)) {
          issue(
            ['questions', i, 'requirement_ids', j],
            `Question "${q.id}" references unknown requirement id "${rid}"`,
          );
        }
      });
    });

    // Every flashcard references requirement ids that exist.
    kit.flashcards.forEach((f, i) => {
      f.requirement_ids.forEach((rid, j) => {
        if (!requirementIds.has(rid)) {
          issue(
            ['flashcards', i, 'requirement_ids', j],
            `Flashcard "${f.id}" references unknown requirement id "${rid}"`,
          );
        }
      });
    });

    // Every schedule day references question ids that exist.
    kit.schedule.days.forEach((d, i) => {
      d.question_ids.forEach((qid, j) => {
        if (!questionIds.has(qid)) {
          issue(
            ['schedule', 'days', i, 'question_ids', j],
            `Schedule day ${d.day} references unknown question id "${qid}"`,
          );
        }
      });
    });

    // Coverage may only list requirement ids that exist.
    kit.coverage.uncovered_requirement_ids.forEach((rid, j) => {
      if (!requirementIds.has(rid)) {
        issue(
          ['coverage', 'uncovered_requirement_ids', j],
          `Coverage references unknown requirement id "${rid}"`,
        );
      }
    });

    // The schedule must span exactly the number of days requested.
    if (kit.schedule.days.length !== kit.schedule.days_available) {
      issue(
        ['schedule', 'days'],
        `schedule.days has ${kit.schedule.days.length} entries but days_available is ${kit.schedule.days_available}`,
      );
    }

    // Day numbers are unique and within range.
    const dayNumbers = new Set<number>();
    kit.schedule.days.forEach((d, i) => {
      if (dayNumbers.has(d.day)) {
        issue(['schedule', 'days', i, 'day'], `Duplicate day number ${d.day}`);
      }
      dayNumbers.add(d.day);
      if (d.day > kit.schedule.days_available) {
        issue(
          ['schedule', 'days', i, 'day'],
          `Day ${d.day} exceeds days_available ${kit.schedule.days_available}`,
        );
      }
    });
  });

// ── Inferred TypeScript types (so the rest of the code speaks the same shape) ──
export type RequirementKind = z.infer<typeof RequirementKind>;
export type RequirementPriority = z.infer<typeof RequirementPriority>;
export type QuestionCategory = z.infer<typeof QuestionCategory>;
export type Source = z.infer<typeof SourceSchema>;
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Kit = z.infer<typeof KitSchema>;
