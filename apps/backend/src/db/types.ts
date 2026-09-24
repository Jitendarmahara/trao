import type { Kit } from '@interview-prep-kit/core';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

/** A saved kit owned by a user (persist enough to reopen and continue later). */
export interface StoredKit {
  id: string;
  userId: string;
  kit: Kit;
  skipped: { url: string; reason: string }[];
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = 'pending' | 'running' | 'failed' | 'done';

/**
 * A generation job persisted in the DB (NOT in server memory) so a slow, 90s
 * generation survives a restart, the UI can poll progress, and a duplicate
 * trigger can find the existing run instead of starting a second one.
 */
export interface GenerationJob {
  id: string;
  userId: string;
  status: JobStatus;
  stage?: string;
  kitId: string | null;
  error: { code: string; message: string } | null;
  input: { jd: string; companyUrl: string; companyName?: string; days: number };
  createdAt: string;
  updatedAt: string;
}

export interface UserRepository {
  create(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
}

export interface KitRepository {
  create(input: Omit<StoredKit, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredKit>;
  findById(id: string): Promise<StoredKit | null>;
  listByUser(userId: string): Promise<StoredKit[]>;
  update(id: string, patch: Partial<Pick<StoredKit, 'kit' | 'skipped'>>): Promise<StoredKit | null>;
  delete(id: string): Promise<boolean>;
}

export interface JobRepository {
  create(input: Omit<GenerationJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<GenerationJob>;
  findById(id: string): Promise<GenerationJob | null>;
  update(
    id: string,
    patch: Partial<Pick<GenerationJob, 'status' | 'stage' | 'kitId' | 'error'>>,
  ): Promise<GenerationJob | null>;
  listByUser(userId: string): Promise<GenerationJob[]>;
}

export interface Repositories {
  users: UserRepository;
  kits: KitRepository;
  jobs: JobRepository;
}
