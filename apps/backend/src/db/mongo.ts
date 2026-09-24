import { randomUUID } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
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

const UserModel = mongoose.model(
  'User',
  new Schema(
    { _id: String, email: { type: String, unique: true }, passwordHash: String, createdAt: String },
    { _id: false, versionKey: false },
  ),
);
const KitModel = mongoose.model(
  'Kit',
  new Schema(
    {
      _id: String,
      userId: { type: String, index: true },
      kit: Schema.Types.Mixed,
      skipped: Schema.Types.Mixed,
      createdAt: String,
      updatedAt: String,
    },
    { _id: false, versionKey: false },
  ),
);
const JobModel = mongoose.model(
  'Job',
  new Schema(
    {
      _id: String,
      userId: { type: String, index: true },
      status: String,
      stage: String,
      kitId: { type: String, default: null },
      error: Schema.Types.Mixed,
      input: Schema.Types.Mixed,
      createdAt: String,
      updatedAt: String,
    },
    { _id: false, versionKey: false },
  ),
);

/* eslint-disable @typescript-eslint/no-explicit-any */
const toUser = (d: any): User => ({ id: d._id, email: d.email, passwordHash: d.passwordHash, createdAt: d.createdAt });
const toKit = (d: any): StoredKit => ({ id: d._id, userId: d.userId, kit: d.kit, skipped: d.skipped ?? [], createdAt: d.createdAt, updatedAt: d.updatedAt });
const toJob = (d: any): GenerationJob => ({ id: d._id, userId: d.userId, status: d.status, stage: d.stage, kitId: d.kitId ?? null, error: d.error ?? null, input: d.input, createdAt: d.createdAt, updatedAt: d.updatedAt });
/* eslint-enable @typescript-eslint/no-explicit-any */

class MongoUserRepository implements UserRepository {
  async create(input: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const doc = await UserModel.create({ _id: randomUUID(), createdAt: now(), ...input });
    return toUser(doc.toObject());
  }
  async findByEmail(email: string): Promise<User | null> {
    const d = await UserModel.findOne({ email }).lean();
    return d ? toUser(d) : null;
  }
  async findById(id: string): Promise<User | null> {
    const d = await UserModel.findById(id).lean();
    return d ? toUser(d) : null;
  }
}

class MongoKitRepository implements KitRepository {
  async create(input: Omit<StoredKit, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredKit> {
    const doc = await KitModel.create({ _id: randomUUID(), createdAt: now(), updatedAt: now(), ...input });
    return toKit(doc.toObject());
  }
  async findById(id: string): Promise<StoredKit | null> {
    const d = await KitModel.findById(id).lean();
    return d ? toKit(d) : null;
  }
  async listByUser(userId: string): Promise<StoredKit[]> {
    const docs = await KitModel.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map(toKit);
  }
  async update(id: string, patch: Partial<Pick<StoredKit, 'kit' | 'skipped'>>): Promise<StoredKit | null> {
    const d = await KitModel.findByIdAndUpdate(id, { ...patch, updatedAt: now() }, { new: true }).lean();
    return d ? toKit(d) : null;
  }
  async delete(id: string): Promise<boolean> {
    const r = await KitModel.deleteOne({ _id: id });
    return r.deletedCount === 1;
  }
}

class MongoJobRepository implements JobRepository {
  async create(input: Omit<GenerationJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<GenerationJob> {
    const doc = await JobModel.create({ _id: randomUUID(), createdAt: now(), updatedAt: now(), ...input });
    return toJob(doc.toObject());
  }
  async findById(id: string): Promise<GenerationJob | null> {
    const d = await JobModel.findById(id).lean();
    return d ? toJob(d) : null;
  }
  async update(
    id: string,
    patch: Partial<Pick<GenerationJob, 'status' | 'stage' | 'kitId' | 'error'>>,
  ): Promise<GenerationJob | null> {
    const d = await JobModel.findByIdAndUpdate(id, { ...patch, updatedAt: now() }, { new: true }).lean();
    return d ? toJob(d) : null;
  }
  async listByUser(userId: string): Promise<GenerationJob[]> {
    const docs = await JobModel.find({ userId }).lean();
    return docs.map(toJob);
  }
}

export async function createMongoRepositories(uri: string): Promise<Repositories> {
  await mongoose.connect(uri);
  return { users: new MongoUserRepository(), kits: new MongoKitRepository(), jobs: new MongoJobRepository() };
}
