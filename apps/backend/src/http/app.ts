import {
  PipelineError,
  validateKit,
  addFlashcard,
  addQuestion,
  deleteFlashcard,
  deleteQuestion,
  editBrief,
  editFlashcard,
  editQuestion,
  moveQuestion,
  regenerateBrief,
  regenerateFlashcards,
  regenerateQuestionCategory,
  regenerateSchedule,
  reorderCategory,
  setQuestionPinned,
  type Kit,
  type QuestionCategory,
} from '@interview-prep-kit/core';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { createSessionToken, SESSION_COOKIE, verifySessionToken } from '../auth/session.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import type { GenerationJob, Repositories, StoredKit } from '../db/types.js';
import type { PipelineRunner } from '../pipeline-runner.js';
import type { SectionGenerator } from '../section-generator.js';
import { AppError, asyncHandler, errorHandler } from './errors.js';

const QUESTION_CATEGORIES = ['technical', 'behavioural', 'system-design', 'company-fit'] as const;
const CategoryEnum = z.enum(QUESTION_CATEGORIES);
const isCategory = (s: string): s is QuestionCategory => (QUESTION_CATEGORIES as readonly string[]).includes(s);

const EditQuestionSchema = z.object({
  prompt: z.string().optional(),
  answer_outline: z.string().optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  requirement_ids: z.array(z.string()).optional(),
});
const AddQuestionSchema = z.object({
  category: CategoryEnum,
  requirement_ids: z.array(z.string()),
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});
const ReorderSchema = z.object({ category: CategoryEnum, orderedIds: z.array(z.string()) });
const AddFlashcardSchema = z.object({ front: z.string().min(1), back: z.string(), requirement_ids: z.array(z.string()) });
const EditFlashcardSchema = z.object({ front: z.string().optional(), back: z.string().optional(), requirement_ids: z.array(z.string()).optional() });
const EditBriefSchema = z.object({ summary: z.string().optional(), what_they_do: z.string().optional() });

export interface AppDeps {
  repositories: Repositories;
  runner: PipelineRunner;
  /** Produces fresh content for regenerate-section; absent → 501 on regenerate. */
  sectionGenerator?: SectionGenerator;
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
  // NOTE ON RESTART SEMANTICS: only the job RECORD is persisted (so progress is
  // observable and an in-flight job is dup-detectable). There is NO worker that
  // resumes execution after a process restart — a `running` job interrupted by a
  // restart is not auto-resumed. (A recovery reaper would need a global job query,
  // which the repository intentionally does not expose here.)
  const runJob = async (job: GenerationJob): Promise<void> => {
    await jobs.update(job.id, { status: 'running' });
    try {
      const { kit, skipped } = await runner.run(job.input, (stage) => {
        void jobs.update(job.id, { stage });
      });
      // Gate persistence on structure validity, independent of which runner ran —
      // never store a kit that fails the Appendix A contract (§13).
      const check = validateKit(kit);
      if (!check.ok) {
        await jobs.update(job.id, {
          status: 'failed',
          error: { code: 'INVALID_KIT', message: check.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join('; ') },
        });
        return;
      }
      const stored = await kits.create({ userId: job.userId, kit: check.kit, skipped });
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

  // Logout clears the browser's session cookie. Because sessions are stateless
  // HMAC tokens (no server-side store), any token already issued stays valid until
  // its `exp`; logout does not retroactively invalidate previously-issued tokens.
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
      // Duplicate detection: if the same user already has an in-flight (pending/
      // running) job for identical input, return it instead of starting a second.
      const sameInput = (a: GenerationJob['input'], b: GenerationJob['input']): boolean =>
        a.jd === b.jd && a.companyUrl === b.companyUrl && (a.companyName ?? '') === (b.companyName ?? '') && a.days === b.days;
      const inFlight = (await jobs.listByUser(req.userId!)).find(
        (j) => (j.status === 'pending' || j.status === 'running') && sameInput(j.input, parsed.data),
      );
      if (inFlight) {
        res.status(202).json({ jobId: inFlight.id, deduplicated: true });
        return;
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

  // ── Builder (server-authoritative): the client sends a COMMAND; the server
  //    reads the persisted kit, applies the op, re-validates, and saves. The whole
  //    kit is never sent by the client, so a regeneration can't clobber edits. ──
  const parseBody = <T>(schema: z.ZodType<T>, req: Request): T => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_INPUT', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    }
    return parsed.data;
  };
  const saveKit = async (id: string, userId: string, mutate: (kit: Kit) => Kit): Promise<StoredKit> => {
    const stored = await ownedKit(id, userId);
    let mutated: Kit;
    try {
      mutated = mutate(stored.kit);
    } catch (err) {
      throw new AppError(400, 'BUILDER_ERROR', err instanceof Error ? err.message : String(err));
    }
    const check = validateKit(mutated);
    if (!check.ok) {
      throw new AppError(422, 'INVALID_KIT', check.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join('; '));
    }
    const saved = await kits.update(id, { kit: check.kit });
    if (!saved) throw new AppError(404, 'NOT_FOUND', 'Kit not found.');
    return saved;
  };
  const respondKit = (res: Response, saved: StoredKit): void => {
    res.json({ kit: saved.kit, updatedAt: saved.updatedAt });
  };

  app.patch('/kits/:id/questions/:qid', requireAuth, asyncHandler(async (req, res) => {
    const patch = parseBody(EditQuestionSchema, req);
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => editQuestion(k, req.params.qid, patch)));
  }));
  app.post('/kits/:id/questions', requireAuth, asyncHandler(async (req, res) => {
    const input = parseBody(AddQuestionSchema, req);
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => addQuestion(k, input)));
  }));
  app.delete('/kits/:id/questions/:qid', requireAuth, asyncHandler(async (req, res) => {
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => deleteQuestion(k, req.params.qid)));
  }));
  app.post('/kits/:id/questions/:qid/move', requireAuth, asyncHandler(async (req, res) => {
    const { category } = parseBody(z.object({ category: CategoryEnum }), req);
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => moveQuestion(k, req.params.qid, category)));
  }));
  app.post('/kits/:id/questions/:qid/pin', requireAuth, asyncHandler(async (req, res) => {
    const { pinned } = parseBody(z.object({ pinned: z.boolean() }), req);
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => setQuestionPinned(k, req.params.qid, pinned)));
  }));
  app.post('/kits/:id/reorder', requireAuth, asyncHandler(async (req, res) => {
    const { category, orderedIds } = parseBody(ReorderSchema, req);
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => reorderCategory(k, category, orderedIds)));
  }));
  app.post('/kits/:id/flashcards', requireAuth, asyncHandler(async (req, res) => {
    const input = parseBody(AddFlashcardSchema, req);
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => addFlashcard(k, input)));
  }));
  app.patch('/kits/:id/flashcards/:fid', requireAuth, asyncHandler(async (req, res) => {
    const patch = parseBody(EditFlashcardSchema, req);
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => editFlashcard(k, req.params.fid, patch)));
  }));
  app.delete('/kits/:id/flashcards/:fid', requireAuth, asyncHandler(async (req, res) => {
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => deleteFlashcard(k, req.params.fid)));
  }));
  app.patch('/kits/:id/brief', requireAuth, asyncHandler(async (req, res) => {
    const patch = parseBody(EditBriefSchema, req);
    respondKit(res, await saveKit(req.params.id, req.userId!, (k) => editBrief(k, patch)));
  }));

  // Regenerate one section using fresh model output, preserving edits elsewhere.
  app.post('/kits/:id/sections/:section/regenerate', requireAuth, asyncHandler(async (req, res) => {
    const { id, section } = req.params;
    const stored = await ownedKit(id, req.userId!);
    let mutate: (kit: Kit) => Kit;

    // Schedule regeneration is deterministic (pure arithmetic) — it needs no LLM,
    // so it works even when no section generator is configured.
    if (section === 'schedule') {
      mutate = (k) => regenerateSchedule(k);
      respondKit(res, await saveKit(id, req.userId!, mutate));
      return;
    }

    const generator = deps.sectionGenerator;
    if (!generator) throw new AppError(501, 'NOT_CONFIGURED', 'Regeneration is not available.');
    if (isCategory(section)) {
      const gen = await generator.questions(section, stored.kit.role.requirements);
      mutate = (k) => regenerateQuestionCategory(k, section, gen);
    } else if (section === 'flashcards') {
      const gen = await generator.flashcards(stored.kit.role.requirements);
      mutate = (k) => regenerateFlashcards(k, gen);
    } else if (section === 'company_brief') {
      const gen = await generator.brief(stored.kit.source.company);
      mutate = (k) => regenerateBrief(k, gen);
    } else {
      throw new AppError(400, 'INVALID_SECTION', `Unknown section: ${section}`);
    }
    respondKit(res, await saveKit(id, req.userId!, mutate));
  }));

  app.use(errorHandler);
  return app;
}
