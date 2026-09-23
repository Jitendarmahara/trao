import { KitSchema, type Kit } from './schema.js';

/** A single, human-readable validation problem, pointed at where it occurred. */
export interface ValidationIssue {
  /** Dotted path into the kit, e.g. "questions.0.difficulty" or "(root)". */
  path: string;
  message: string;
}

/** Result of validating an unknown value against the Appendix A kit structure. */
export type ValidationResult =
  | { ok: true; kit: Kit }
  | { ok: false; errors: ValidationIssue[] };

/**
 * Validate an unknown value against the exact kit structure.
 *
 * Used as a gate everywhere a kit crosses a boundary: before the API saves a kit,
 * before the batch command writes one, and after the model returns generated JSON.
 * Never trust a kit that has not passed through here.
 */
export function validateKit(input: unknown): ValidationResult {
  const result = KitSchema.safeParse(input);
  if (result.success) {
    return { ok: true, kit: result.data };
  }
  const errors: ValidationIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
  return { ok: false, errors };
}
