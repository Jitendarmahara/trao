import { z } from 'zod';
import { RequirementKind, RequirementPriority } from '../kit/schema.js';

/**
 * Shape we ask the model to return. Note: NO `id` field — ids are assigned
 * deterministically in code after extraction so they are always stable and
 * unique, never left to the model.
 */
export const ExtractedRequirementSchema = z.object({
  text: z.string().min(1),
  kind: RequirementKind,
  priority: RequirementPriority,
});

export const ExtractedRoleLlmSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(ExtractedRequirementSchema),
});

export type ExtractedRoleLlm = z.infer<typeof ExtractedRoleLlmSchema>;
