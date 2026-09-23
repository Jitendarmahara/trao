import { describe, it, expect } from 'vitest';
import { extractRequirements } from './extract.js';
import { validateKit } from '../kit/index.js';
import type { LlmClient } from '../llm/index.js';

/** Stub LLM: validates the call against the passed schema, returns canned data. */
function stub(data: unknown): Pick<LlmClient, 'callJSON'> {
  return { callJSON: async (opts) => opts.schema.parse(data) };
}

const RICH = {
  title: 'Senior Backend Engineer',
  seniority: 'senior',
  responsibilities: ['Design and build APIs', 'Mentor junior engineers'],
  requirements: [
    { text: '5+ years with Node', kind: 'technical', priority: 'must' },
    { text: 'Mentoring junior engineers', kind: 'behavioural', priority: 'must' },
    { text: 'Experience with Redis', kind: 'technical', priority: 'nice' },
  ],
};

describe('extractRequirements', () => {
  it('assigns stable, unique ids and preserves kind/priority', async () => {
    const role = await extractRequirements('long job description...', { llm: stub(RICH) });
    expect(role.requirements.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(role.requirements[1].kind).toBe('behavioural');
    expect(role.requirements[2].priority).toBe('nice');
    expect(role.title).toBe('Senior Backend Engineer');
  });

  it('dedupes requirements that differ only by case/whitespace', async () => {
    const role = await extractRequirements('jd', {
      llm: stub({
        title: '',
        seniority: '',
        responsibilities: [],
        requirements: [
          { text: 'React', kind: 'technical', priority: 'must' },
          { text: '  react ', kind: 'technical', priority: 'must' },
        ],
      }),
    });
    expect(role.requirements).toHaveLength(1);
  });

  it('caps the number of requirements kept', async () => {
    const many = {
      title: '',
      seniority: '',
      responsibilities: [],
      requirements: Array.from({ length: 5 }, (_, i) => ({
        text: `req ${i}`,
        kind: 'technical' as const,
        priority: 'must' as const,
      })),
    };
    const role = await extractRequirements('jd', { llm: stub(many), maxRequirements: 2 });
    expect(role.requirements.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('returns an empty role for an empty JD without calling the model (thin → thin)', async () => {
    const throwing: Pick<LlmClient, 'callJSON'> = {
      callJSON: async () => {
        throw new Error('LLM should not be called for an empty JD');
      },
    };
    const role = await extractRequirements('   \n  ', { llm: throwing });
    expect(role.requirements).toHaveLength(0);
    expect(role.title).toBe('');
  });

  it('produces a role that is valid inside the Appendix A kit structure', async () => {
    const role = await extractRequirements('jd', { llm: stub(RICH) });
    const kit = {
      source: { company: '', company_url: '', role: '', location: '', jd_chars: 0, researched_at: '', pages_used: [] },
      company_brief: { summary: '', what_they_do: '', sources: [] },
      role,
      questions: [],
      flashcards: [],
      schedule: { days_available: 1, days: [{ day: 1, focus: '', question_ids: [], minutes: 0 }] },
      coverage: { uncovered_requirement_ids: [], passes: 0 },
    };
    expect(validateKit(kit).ok).toBe(true);
  });
});
