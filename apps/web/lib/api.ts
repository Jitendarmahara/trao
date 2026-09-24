import type { Kit } from '@interview-prep-kit/core';

export interface User {
  id: string;
  email: string;
}
export interface KitSummary {
  id: string;
  company: string;
  role: string;
  days: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface Job {
  id: string;
  status: 'pending' | 'running' | 'failed' | 'done';
  stage?: string;
  kitId: string | null;
  error: { code: string; message: string } | null;
}
export interface StoredKit {
  id: string;
  kit: Kit;
  skipped: { url: string; reason: string }[];
  updatedAt: string;
}
export interface KitResponse {
  kit: Kit;
  updatedAt: string;
}
export interface CreateKitInput {
  jd: string;
  companyUrl: string;
  companyName?: string;
  days: number;
}
export type QuestionCategory = 'technical' | 'behavioural' | 'system-design' | 'company-fit';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let base = '/api';
/** Override the API base (tests / non-proxied deploys). */
export function setApiBase(next: string): void {
  base = next;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method,
    credentials: 'include',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? res.statusText);
  }
  return data as T;
}

/**
 * Typed API client. The builder methods send only COMMANDS (a patch, an id, a
 * category) — never the whole kit — matching the server-authoritative design; the
 * server returns the updated kit.
 */
export const api = {
  register: (email: string, password: string) => req<{ user: User }>('POST', '/auth/register', { email, password }),
  login: (email: string, password: string) => req<{ user: User }>('POST', '/auth/login', { email, password }),
  logout: () => req<{ ok: true }>('POST', '/auth/logout'),
  me: () => req<{ user: User }>('GET', '/auth/me'),

  createKit: (input: CreateKitInput) => req<{ jobId?: string; job?: Job }>('POST', '/kits', input),
  getJob: (id: string) => req<{ job: Job }>('GET', `/jobs/${id}`),
  listKits: () => req<{ kits: KitSummary[] }>('GET', '/kits'),
  getKit: (id: string) => req<StoredKit>('GET', `/kits/${id}`),
  deleteKit: (id: string) => req<{ ok: true }>('DELETE', `/kits/${id}`),

  // ── Builder commands (server-authoritative; never send the whole kit) ──
  editQuestion: (kitId: string, qid: string, patch: Record<string, unknown>) =>
    req<KitResponse>('PATCH', `/kits/${kitId}/questions/${qid}`, patch),
  addQuestion: (kitId: string, q: { category: QuestionCategory; requirement_ids: string[]; prompt: string; answer_outline: string; difficulty: number }) =>
    req<KitResponse>('POST', `/kits/${kitId}/questions`, q),
  deleteQuestion: (kitId: string, qid: string) => req<KitResponse>('DELETE', `/kits/${kitId}/questions/${qid}`),
  moveQuestion: (kitId: string, qid: string, category: QuestionCategory) =>
    req<KitResponse>('POST', `/kits/${kitId}/questions/${qid}/move`, { category }),
  pinQuestion: (kitId: string, qid: string, pinned: boolean) =>
    req<KitResponse>('POST', `/kits/${kitId}/questions/${qid}/pin`, { pinned }),
  reorder: (kitId: string, category: QuestionCategory, orderedIds: string[]) =>
    req<KitResponse>('POST', `/kits/${kitId}/reorder`, { category, orderedIds }),
  addFlashcard: (kitId: string, f: { front: string; back: string; requirement_ids: string[] }) =>
    req<KitResponse>('POST', `/kits/${kitId}/flashcards`, f),
  editFlashcard: (kitId: string, fid: string, patch: Record<string, unknown>) =>
    req<KitResponse>('PATCH', `/kits/${kitId}/flashcards/${fid}`, patch),
  deleteFlashcard: (kitId: string, fid: string) => req<KitResponse>('DELETE', `/kits/${kitId}/flashcards/${fid}`),
  editBrief: (kitId: string, patch: { summary?: string; what_they_do?: string }) =>
    req<KitResponse>('PATCH', `/kits/${kitId}/brief`, patch),
  regenerate: (kitId: string, section: string) =>
    req<KitResponse>('POST', `/kits/${kitId}/sections/${section}/regenerate`),
};
