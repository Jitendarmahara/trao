import { describe, it, expect } from 'vitest';
import { generateCompanyBrief } from './company-brief.js';
import { generateQuestions } from './questions.js';
import { generateFlashcards } from './flashcards.js';
import { validateKit } from '../kit/index.js';
import type { Requirement } from '../kit/schema.js';
import type { LlmClient } from '../llm/index.js';
import type { CompanyResearch } from '../retrieval/index.js';
import type { InterviewResearch } from '../interview-research/index.js';

function stub(data: unknown): Pick<LlmClient, 'callJSON'> {
  return { callJSON: async (opts) => opts.schema.parse(data) };
}
const throwing: Pick<LlmClient, 'callJSON'> = {
  callJSON: async () => {
    throw new Error('LLM should not be called');
  },
};

const REQS: Requirement[] = [
  { id: 'r1', text: '5+ years with Node', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentoring junior engineers', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'Experience with Redis', kind: 'technical', priority: 'nice' },
];

const QUESTION_DATA = {
  questions: [{ requirement_ids: ['r1'], prompt: 'P', answer_outline: 'A', difficulty: 2 }],
};

function companyResearch(hasPages: boolean): CompanyResearch {
  return {
    company_url: 'http://acme.test/',
    pages_used: hasPages ? ['http://acme.test/'] : [],
    skipped: [],
    homepage: hasPages ? { url: 'http://acme.test/', text: 'We build payment APIs.', hiring: false } : undefined,
    hiringPages: [],
    otherPages: [],
  };
}

function interview(overrides: Partial<InterviewResearch>): InterviewResearch {
  return {
    found: true,
    summary: 'Take-home then a system design round.',
    rounds: [],
    hasTakeHome: false,
    hasSystemDesign: false,
    behaviouralEmphasis: false,
    sources: [],
    ...overrides,
  };
}

describe('generateQuestions — research changes the output', () => {
  it('includes system-design and company-fit when research supports them', async () => {
    const questions = await generateQuestions(
      {
        role: { requirements: REQS },
        companyResearch: companyResearch(true),
        interviewResearch: interview({ hasSystemDesign: true, behaviouralEmphasis: true }),
      },
      { llm: stub(QUESTION_DATA) },
    );
    const categories = new Set(questions.map((q) => q.category));
    expect(categories).toEqual(new Set(['technical', 'behavioural', 'system-design', 'company-fit']));
  });

  it('omits system-design and company-fit when research does NOT support them', async () => {
    const questions = await generateQuestions(
      {
        role: { requirements: REQS },
        companyResearch: companyResearch(false),
        interviewResearch: interview({ hasSystemDesign: false, behaviouralEmphasis: false }),
      },
      { llm: stub(QUESTION_DATA) },
    );
    const categories = new Set(questions.map((q) => q.category));
    expect(categories.has('system-design')).toBe(false);
    expect(categories.has('company-fit')).toBe(false);
    expect(categories.has('technical')).toBe(true);
    expect(categories.has('behavioural')).toBe(true);
  });

  it('does NOT create company-fit from behavioural emphasis alone (no company info)', async () => {
    const questions = await generateQuestions(
      {
        role: { requirements: REQS },
        companyResearch: companyResearch(false), // no company info
        interviewResearch: interview({ behaviouralEmphasis: true }),
      },
      { llm: stub(QUESTION_DATA) },
    );
    const categories = new Set(questions.map((q) => q.category));
    expect(categories.has('company-fit')).toBe(false); // ungrounded → omitted
    expect(categories.has('behavioural')).toBe(true); // emphasis still drives behavioural
  });

  it('enforces maxPerRequirement in code even if the model returns more', async () => {
    const fiveForR1 = {
      questions: Array.from({ length: 5 }, () => ({
        requirement_ids: ['r1'],
        prompt: 'P',
        answer_outline: 'A',
        difficulty: 2,
      })),
    };
    const questions = await generateQuestions(
      { role: { requirements: [REQS[0]] } }, // only r1 (technical)
      { llm: stub(fiveForR1), maxPerRequirement: 2 },
    );
    // Model returned 5 for r1; code caps it at 2.
    expect(questions.filter((q) => q.requirement_ids.includes('r1'))).toHaveLength(2);
    expect(questions).toHaveLength(2);
  });

  it('assigns sequential ids and filters hallucinated requirement ids', async () => {
    const questions = await generateQuestions(
      { role: { requirements: [REQS[0]] } }, // only r1 is a valid id
      { llm: stub({ questions: [{ requirement_ids: ['r1', 'r999'], prompt: 'P', answer_outline: 'A', difficulty: 3 }] }) },
    );
    expect(questions[0].id).toBe('q1');
    expect(questions[0].requirement_ids).toEqual(['r1']); // r999 dropped
  });
});

describe('generateCompanyBrief', () => {
  it('returns an honest brief with no LLM call when there is no research', async () => {
    const brief = await generateCompanyBrief({ companyName: 'Acme' }, { llm: throwing });
    expect(brief.summary).toMatch(/little public information/i);
    expect(brief.sources).toEqual([]);
  });

  it('uses page text and takes sources from the actually-fetched URLs', async () => {
    const brief = await generateCompanyBrief(
      { companyName: 'Acme', research: companyResearch(true) },
      { llm: stub({ summary: 'Acme builds payments infra.', what_they_do: 'A payments API.' }) },
    );
    expect(brief.summary).toContain('payments');
    expect(brief.sources).toEqual(['http://acme.test/']);
  });
});

describe('generateFlashcards', () => {
  it('assigns ids and filters unknown requirement ids', async () => {
    const cards = await generateFlashcards(
      { role: { requirements: [REQS[0]] } },
      { llm: stub({ flashcards: [{ front: 'Q', back: 'A', requirement_ids: ['r1', 'rX'] }] }) },
    );
    expect(cards[0].id).toBe('f1');
    expect(cards[0].requirement_ids).toEqual(['r1']);
  });

  it('returns [] with no LLM call when the role has no requirements', async () => {
    const cards = await generateFlashcards({ role: { requirements: [] } }, { llm: throwing });
    expect(cards).toEqual([]);
  });
});

describe('generation integration', () => {
  it('produces brief + questions + flashcards that validate inside a kit', async () => {
    const research = companyResearch(true);
    const brief = await generateCompanyBrief(
      { companyName: 'Acme', research },
      { llm: stub({ summary: 's', what_they_do: 'w' }) },
    );
    const questions = await generateQuestions(
      { role: { requirements: REQS }, companyResearch: research, interviewResearch: interview({ hasSystemDesign: true }) },
      { llm: stub(QUESTION_DATA) },
    );
    const flashcards = await generateFlashcards(
      { role: { requirements: REQS } },
      { llm: stub({ flashcards: [{ front: 'Q', back: 'A', requirement_ids: ['r1'] }] }) },
    );

    const kit = {
      source: { company: 'Acme', company_url: 'http://acme.test/', role: '', location: '', jd_chars: 0, researched_at: '', pages_used: research.pages_used },
      company_brief: brief,
      role: { title: '', seniority: '', responsibilities: [], requirements: REQS },
      questions,
      flashcards,
      schedule: { days_available: 1, days: [{ day: 1, focus: '', question_ids: [], minutes: 0 }] },
      coverage: { uncovered_requirement_ids: [], passes: 0 },
    };
    const result = validateKit(kit);
    expect(result.ok).toBe(true);
  });
});
