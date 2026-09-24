/**
 * Builder item-state model (the regeneration "hardest state problem").
 *
 * Every editable item (question, flashcard) carries optional metadata — allowed by
 * the Appendix A schema's passthrough, so the kit stays a single source of truth
 * and still validates:
 *   - origin: "generated" (from the model) | "user" (hand-added)
 *   - state:  "generated" | "edited" | "pinned"
 *   - order:  integer, for persisted reordering
 *
 * Rule: regenerating a section replaces ONLY origin:generated + state:generated
 * items; anything edited, pinned, or user-added is PROTECTED and survives.
 */
export type ItemOrigin = 'generated' | 'user';
export type ItemState = 'generated' | 'edited' | 'pinned';

export function itemOrigin(item: Record<string, unknown>): ItemOrigin {
  return item.origin === 'user' ? 'user' : 'generated';
}

export function itemState(item: Record<string, unknown>): ItemState {
  return item.state === 'edited' || item.state === 'pinned' ? item.state : 'generated';
}

/** Protected items are never replaced by a regeneration. */
export function isProtected(item: Record<string, unknown>): boolean {
  return itemOrigin(item) === 'user' || itemState(item) !== 'generated';
}
