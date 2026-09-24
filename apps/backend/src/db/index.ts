import { createInMemoryRepositories } from './memory.js';
import type { Repositories } from './types.js';

export * from './types.js';
export { createInMemoryRepositories } from './memory.js';

/**
 * Choose persistence from the environment: MongoDB when MONGODB_URI is set,
 * otherwise the in-memory store (local dev / tests). The Mongo module is imported
 * lazily so environments without it (or without a running DB) still run.
 */
export async function createRepositories(env: NodeJS.ProcessEnv = process.env): Promise<Repositories> {
  if (env.MONGODB_URI) {
    const { createMongoRepositories } = await import('./mongo.js');
    return createMongoRepositories(env.MONGODB_URI);
  }
  return createInMemoryRepositories();
}
