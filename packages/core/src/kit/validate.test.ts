import { describe, it, expect } from 'vitest';
import { validateKit, type ValidationIssue } from './validate.js';

/** A structurally valid kit (Appendix A). Negative tests clone and break this. */
function validKit(): Record<string, unknown> {
  return {
    source: {
      company: 'Acme',
      company_url: 'https://acme.example',
      role: 'Senior Backend Engineer',
      location: 'Remote',
      jd_chars: 1200,
      researched_at: '2026-09-01T09:12:44Z',
      pages_used: ['https://acme.example/careers'],
    },
    company_brief: {
      summary: 'Acme builds payment infrastructure.',
      what_they_do: 'APIs for online payments.',
      sources: ['https://acme.example'],
    },
    role: {
      title: 'Senior Backend Engineer',
      seniority: 'senior',
      responsibilities: ['Design and build APIs'],
      requirements: [
        { id: 'r1', text: '5+ years with Node', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Mentoring junior engineers', kind: 'behavioural', priority: 'must' },
        { id: 'r3', text: 'Experience with Redis', kind: 'technical', priority: 'nice' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How would you structure a Node service for high throughput?',
        answer_outline: 'Discuss event loop, clustering, backpressure.',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Tell me about a time you mentored a junior engineer.',
        answer_outline: 'STAR: situation, task, action, result.',
        difficulty: 1,
      },
    ],
    flashcards: [{ id: 'f1', front: 'What is backpressure?', back: 'Flow control...', requirement_ids: ['r1'] }],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Core technical', question_ids: ['q1'], minutes: 60 },
        { day: 2, focus: 'Behavioural', question_ids: ['q2'], minutes: 30 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

/** Assert a kit is invalid and return its errors for further inspection. */
function expectInvalid(input: unknown): ValidationIssue[] {
  const result = validateKit(input);
  expect(result.ok).toBe(false);
  return result.ok === false ? result.errors : [];
}

/** True if some error is anchored at the given dotted path. */
function hasErrorAt(errors: ValidationIssue[], path: string): boolean {
  return errors.some((e) => e.path === path);
}

describe('validateKit — happy path', () => {
  it('accepts a structurally valid kit', () => {
    const result = validateKit(validKit());
    expect(result.ok).toBe(true);
  });

  it('preserves extra/extension fields (brief allows extending the structure)', () => {
    const kit = validKit();
    (kit.questions as Record<string, unknown>[])[0].state = 'edited';
    const result = validateKit(kit);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const q0 = result.kit.questions[0] as Record<string, unknown>;
      expect(q0.state).toBe('edited');
    }
  });
});

describe('validateKit — number rules (integers only, difficulty 1..3)', () => {
  it('rejects a non-integer difficulty', () => {
    const kit = validKit();
    (kit.questions as Record<string, unknown>[])[0].difficulty = 2.5;
    expect(hasErrorAt(expectInvalid(kit), 'questions.0.difficulty')).toBe(true);
  });

  it('rejects difficulty out of range', () => {
    const kit = validKit();
    (kit.questions as Record<string, unknown>[])[0].difficulty = 4;
    expect(hasErrorAt(expectInvalid(kit), 'questions.0.difficulty')).toBe(true);
  });

  it('rejects a non-integer minutes ("no floats, no about an hour")', () => {
    const kit = validKit();
    (((kit.schedule as Record<string, unknown>).days as Record<string, unknown>[])[0]).minutes = 45.5;
    expect(hasErrorAt(expectInvalid(kit), 'schedule.days.0.minutes')).toBe(true);
  });
});

describe('validateKit — enums named exactly', () => {
  it('rejects a bad requirement priority ("required" is not "must")', () => {
    const kit = validKit();
    (((kit.role as Record<string, unknown>).requirements as Record<string, unknown>[])[0]).priority =
      'required';
    expect(hasErrorAt(expectInvalid(kit), 'role.requirements.0.priority')).toBe(true);
  });

  it('rejects a bad question category', () => {
    const kit = validKit();
    (kit.questions as Record<string, unknown>[])[0].category = 'coding';
    expect(hasErrorAt(expectInvalid(kit), 'questions.0.category')).toBe(true);
  });
});

describe('validateKit — referential integrity (what makes coverage checkable)', () => {
  it('rejects a question referencing an unknown requirement id', () => {
    const kit = validKit();
    (kit.questions as Record<string, unknown>[])[0].requirement_ids = ['r9'];
    const errors = expectInvalid(kit);
    expect(hasErrorAt(errors, 'questions.0.requirement_ids.0')).toBe(true);
  });

  it('rejects a schedule day referencing an unknown question id', () => {
    const kit = validKit();
    (((kit.schedule as Record<string, unknown>).days as Record<string, unknown>[])[0]).question_ids = [
      'q9',
    ];
    expect(hasErrorAt(expectInvalid(kit), 'schedule.days.0.question_ids.0')).toBe(true);
  });

  it('rejects a coverage entry referencing an unknown requirement id', () => {
    const kit = validKit();
    (kit.coverage as Record<string, unknown>).uncovered_requirement_ids = ['r9'];
    expect(hasErrorAt(expectInvalid(kit), 'coverage.uncovered_requirement_ids.0')).toBe(true);
  });

  it('rejects duplicate requirement ids (ids must be stable/unique)', () => {
    const kit = validKit();
    const reqs = (kit.role as Record<string, unknown>).requirements as Record<string, unknown>[];
    reqs[1].id = 'r1';
    expect(hasErrorAt(expectInvalid(kit), 'role.requirements.1.id')).toBe(true);
  });
});

describe('validateKit — structural shape', () => {
  it('rejects a kit missing a required top-level field', () => {
    const kit = validKit();
    delete kit.company_brief;
    expect(hasErrorAt(expectInvalid(kit), 'company_brief')).toBe(true);
  });

  it('rejects when schedule.days length does not equal days_available', () => {
    const kit = validKit();
    (kit.schedule as Record<string, unknown>).days_available = 5; // but only 2 days present
    expect(hasErrorAt(expectInvalid(kit), 'schedule.days')).toBe(true);
  });

  it('reports errors as { path, message } pairs', () => {
    const errors = expectInvalid({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toHaveProperty('path');
    expect(errors[0]).toHaveProperty('message');
  });
});
