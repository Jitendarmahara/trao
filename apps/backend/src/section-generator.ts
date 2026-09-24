import {
  createLlmClient,
  generateCompanyBrief,
  generateFlashcards,
  generateQuestions,
  type GeneratedFlashcard,
  type GeneratedQuestion,
  type QuestionCategory,
  type Requirement,
} from '@interview-prep-kit/core';

/**
 * Produces fresh content for ONE section during a regenerate. Injectable so the
 * API and its tests share one interface (tests pass a stub; production uses the
 * LLM). Note: regeneration works from the kit's requirements — the original crawl/
 * interview research is not re-fetched, so company-fit/system-design context is
 * only as rich as the requirements allow.
 */
export interface SectionGenerator {
  questions(category: QuestionCategory, requirements: Requirement[]): Promise<GeneratedQuestion[]>;
  flashcards(requirements: Requirement[]): Promise<GeneratedFlashcard[]>;
  brief(companyName: string): Promise<{ summary: string; what_they_do: string; sources: string[] }>;
}

export function createProductionSectionGenerator(): SectionGenerator {
  const llm = createLlmClient();
  return {
    questions: async (category, requirements) => {
      const questions = await generateQuestions({ role: { requirements } }, { llm });
      return questions
        .filter((q) => q.category === category)
        .map((q) => ({
          requirement_ids: q.requirement_ids,
          prompt: q.prompt,
          answer_outline: q.answer_outline,
          difficulty: q.difficulty,
        }));
    },
    flashcards: async (requirements) => {
      const cards = await generateFlashcards({ role: { requirements } }, { llm });
      return cards.map((f) => ({ front: f.front, back: f.back, requirement_ids: f.requirement_ids }));
    },
    brief: async (companyName) => {
      const brief = await generateCompanyBrief({ companyName }, { llm });
      return { summary: brief.summary, what_they_do: brief.what_they_do, sources: brief.sources };
    },
  };
}
