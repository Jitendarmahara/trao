import { randomUUID } from 'node:crypto';
import type {
  GenerationJob,
  JobRepository,
  KitRepository,
  Repositories,
  StoredKit,
  User,
  UserRepository,
} from './types.js';

const now = (): string => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);

/** In-memory repositories — used by tests and local dev without a database. */
export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();

  async create(input: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const user: User = { id: randomUUID(), createdAt: now(), ...input };
    this.byId.set(user.id, user);
    return clone(user);
  }
  async findByEmail(email: string): Promise<User | null> {
    for (const u of this.byId.values()) if (u.email === email) return clone(u);
    return null;
  }
  async findById(id: string): Promise<User | null> {
    const u = this.byId.get(id);
    return u ? clone(u) : null;
  }
}

export class InMemoryKitRepository implements KitRepository {
  private readonly byId = new Map<string, StoredKit>();

  async create(input: Omit<StoredKit, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredKit> {
    const kit: StoredKit = { id: randomUUID(), createdAt: now(), updatedAt: now(), ...clone(input) };
    this.byId.set(kit.id, kit);
    return clone(kit);
  }
  async findById(id: string): Promise<StoredKit | null> {
    const k = this.byId.get(id);
    return k ? clone(k) : null;
  }
  async listByUser(userId: string): Promise<StoredKit[]> {
    return [...this.byId.values()]
      .filter((k) => k.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(clone);
  }
  async update(id: string, patch: Partial<Pick<StoredKit, 'kit' | 'skipped'>>): Promise<StoredKit | null> {
    const existing = this.byId.get(id);
    if (!existing) return null;
    const updated: StoredKit = { ...existing, ...clone(patch), updatedAt: now() };
    this.byId.set(id, updated);
    return clone(updated);
  }
  async delete(id: string): Promise<boolean> {
    return this.byId.delete(id);
  }
}

export class InMemoryJobRepository implements JobRepository {
  private readonly byId = new Map<string, GenerationJob>();

  async create(input: Omit<GenerationJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<GenerationJob> {
    const job: GenerationJob = { id: randomUUID(), createdAt: now(), updatedAt: now(), ...clone(input) };
    this.byId.set(job.id, job);
    return clone(job);
  }
  async findById(id: string): Promise<GenerationJob | null> {
    const j = this.byId.get(id);
    return j ? clone(j) : null;
  }
  async update(
    id: string,
    patch: Partial<Pick<GenerationJob, 'status' | 'stage' | 'kitId' | 'error'>>,
  ): Promise<GenerationJob | null> {
    const existing = this.byId.get(id);
    if (!existing) return null;
    const updated: GenerationJob = { ...existing, ...patch, updatedAt: now() };
    this.byId.set(id, updated);
    return clone(updated);
  }
  async listByUser(userId: string): Promise<GenerationJob[]> {
    return [...this.byId.values()].filter((j) => j.userId === userId).map(clone);
  }
}

export function createInMemoryRepositories(): Repositories {
  return {
    users: new InMemoryUserRepository(),
    kits: new InMemoryKitRepository(),
    jobs: new InMemoryJobRepository(),
  };
}
