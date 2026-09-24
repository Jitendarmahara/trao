import { PipelineError } from '@interview-prep-kit/core';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from '../auth/session.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import type { GenerationJob, Repositories, StoredKit } from '../db/types.js';
import type { PipelineRunner } from '../pipeline-runner.js';
import { AppError, asyncHandler, errorHandler } from './errors.js';

export interface AppDeps {
  repositories: Repositories;
  runner: PipelineRunner;
  sessionSecret: string;
  /** When true, POST /kits waits for generation to finish (used by tests). */
  awaitGeneration?: boolean;
  /** Cookie `secure` flag (true behind HTTPS in production). */
  secureCookies?: boolean;
}

const CredentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const CreateKitSchema = z.object({
  jd: z.string(),
  companyUrl: z.string().min(1),
  companyName: z.string().optional(),
  days: z.number().int().min(1),
});

export function buildApp(deps: AppDeps): Express {
  const { repositories, runner, sessionSecret } = deps;
  const { users, kits, jobs } = repositories;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const setSession = (res: Response, userId: string): void => {
    res.cookie(SESSION_COOKIE, createSessionToken(userId, sessionSecret), {
      httpOnly: true,
      sameSite: 'lax',
      secure: deps.secureCookies ?? false,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  };

  const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const userId = verifySessionToken(cookies[SESSION_COOKIE], sessionSecret);
    if (!userId) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required.');
    req.userId = userId;
    next();
  };

  /** Load a kit the caller owns, or throw 404/403 appropriately. */
  const ownedKit = async (id: string, userId: string): Promise<StoredKit> => {
    const stored = await kits.findById(id);
    if (!stored) throw new AppError(404, 'NOT_FOUND', 'Kit not found.');
    if (stored.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'This kit belongs to another user.');
    return stored;
  };

  // Run a generation job to completion, persisting progress + result to the DB.
  const runJob = async (job: GenerationJob): Promise<void> => {
    await jobs.update(job.id, { status: 'running' });
    try {
      const { kit, skipped } = await runner.run(job.input, (stage) => {
        void jobs.update(job.id, { stage });
      });
      const stored = await kits.create({ userId: job.userId, kit, skipped });
      await jobs.update(job.id, { status: 'done', kitId: stored.id });
    } catch (err) {
      const code = err instanceof PipelineError ? err.code : 'GENERATION_FAILED';
      await jobs.update(job.id, {
        status: 'failed',
        error: { code, message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  // ── Auth ──
  app.post(
    '/auth/register',
    asyncHandler(async (req, res) => {
      const parsed = CredentialsSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', 'Valid email and 8+ char password required.');
      if (await users.findByEmail(parsed.data.email)) {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
      }
      const user = await users.create({
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
      });
      setSession(res, user.id);
      res.status(201).json({ user: { id: user.id, email: user.email } });
    }),
  );

  app.post(
    '/auth/login',
    asyncHandler(async (req, res) => {
      const parsed = CredentialsSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, 'INVALID_INPUT', 'Email and password required.');
      const user = await users.findByEmail(parsed.data.email);
      if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
      }
      setSession(res, user.id);
      res.json({ user: { id: user.id, email: user.email } });
    }),
  );

  app.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get(
    '/auth/me',
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = await users.findById(req.userId!);
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Session no longer valid.');
      res.json({ user: { id: user.id, email: user.email } });
    }),
  );

  // ── Kits ──
  app.post(
    '/kits',
    requireAuth,
    asyncHandler(async (req, res) => {
      const parsed = CreateKitSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_INPUT', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      }
      const job = await jobs.create({
        userId: req.userId!,
        status: 'pending',
        kitId: null,
        error: null,
        input: parsed.data,
      });
      if (deps.awaitGeneration) {
        await runJob(job);
        res.status(201).json({ job: await jobs.findById(job.id) });
      } else {
        void runJob(job); // background; poll GET /jobs/:id for progress
        res.status(202).json({ jobId: job.id });
      }
    }),
  );

  app.get(
    '/jobs/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const job = await jobs.findById(req.params.id);
      if (!job) throw new AppError(404, 'NOT_FOUND', 'Job not found.');
      if (job.userId !== req.userId) throw new AppError(403, 'FORBIDDEN', 'This job belongs to another user.');
      res.json({ job });
    }),
  );

  app.get(
    '/kits',
    requireAuth,
    asyncHandler(async (req, res) => {
      const stored = await kits.listByUser(req.userId!);
      res.json({
        kits: stored.map((s) => ({
          id: s.id,
          company: s.kit.source.company,
          role: s.kit.role.title,
          days: s.kit.schedule.days_available,
          questionCount: s.kit.questions.length,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      });
    }),
  );

  app.get(
    '/kits/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const stored = await ownedKit(req.params.id, req.userId!);
      res.json({ kit: stored.kit, skipped: stored.skipped, id: stored.id, updatedAt: stored.updatedAt });
    }),
  );

  app.delete(
    '/kits/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await ownedKit(req.params.id, req.userId!);
      await kits.delete(req.params.id);
      res.json({ ok: true });
    }),
  );

  app.use(errorHandler);
  return app;
}
