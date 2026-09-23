import { z } from 'zod';
import type { Flashcard, Requirement } from '../kit/schema.js';
import type { LlmClient } from '../llm/index.js';

const FlashcardsLlmSchema = z.object({
  flashcards: z.array(
    z.object({
      front: z.string().min(1),
      back: z.string(),
      requirement_ids: z.array(z.string()),
    }),
  ),
});

export interface GenerateFlashcardsInput {
  role: { requirements: Requirement[] };
}

export interface GenerateFlashcardsOptions {
  llm: Pick<LlmClient, 'callJSON'>;
}

const SYSTEM = `You write concise interview revision flashcards (front: a prompt or term; back: a crisp answer) for the listed requirements.
- Reference the requirement ids each card covers using ONLY the ids listed. Do not invent requirements.`;

/**
 * Generate flashcards for the requirements. Flashcard ids (f1, f2, …) are assigned
 * in code and requirement references are filtered to ids that actually exist.
 */
export async function generateFlashcards(
  input: GenerateFlashcardsInput,
  options: GenerateFlashcardsOptions,
): Promise<Flashcard[]> {
  const reqs = input.role.requirements;
  if (reqs.length === 0) return [];

  const allowed = new Set(reqs.map((r) => r.id));
  const reqLines = reqs.map((r) => `${r.id}: ${r.text}`).join('\n');

  const result = await options.llm.callJSON({
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Requirements:\n${reqLines}\n\nReturn JSON {"flashcards":[{"front":string,"back":string,"requirement_ids":string[]}]}.`,
      },
    ],
    schema: FlashcardsLlmSchema,
    temperature: 0.3,
  });

  return result.flashcards.map((f, i) => ({
    id: `f${i + 1}`,
    front: f.front.trim(),
    back: f.back.trim(),
    requirement_ids: f.requirement_ids.filter((id) => allowed.has(id)),
  }));
}
