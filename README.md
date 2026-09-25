# AI Interview Prep Kit

Turns a pasted **job description** + a **company website** + a **number of days** into a
personalised interview prep kit — a company brief, a role breakdown, a categorised question
bank, flashcards, and a day-by-day study schedule — then lets you reshape it and practise
against it.

> Trao Full-Stack Engineering Assessment (`FS-AI-INTERVIEW-01`).

---

## Table of contents

- [What it does](#what-it-does)
- [Tech stack & why](#tech-stack--why)
- [Repository layout](#repository-layout)
- [Setup](#setup)
- [The batch entry point (Appendix B)](#the-batch-entry-point-appendix-b)
- [Architecture](#architecture)
- [The pipeline: how the stages are sequenced](#the-pipeline-how-the-stages-are-sequenced)
- [Retrieval approach & sources](#retrieval-approach--sources)
- [Coverage second pass (the decision)](#coverage-second-pass-the-decision)
- [Schedule allocation](#schedule-allocation)
- [The regeneration state model (the hard part)](#the-regeneration-state-model-the-hard-part)
- [Practice mode](#practice-mode)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Trade-offs & known limits](#trade-offs--known-limits)

---

## What it does

You paste a job description, give a company URL and the number of days until the interview.
The app:

1. **Extracts requirements** from the JD (`must` / `nice`, `technical` / `behavioural` /
   `domain`), each with a stable id — nothing invented that the posting doesn't contain.
2. **Crawls the company site** (respecting `robots.txt`) to learn what they do and find a
   hiring/about page by *ranking links*, not guessing fixed paths.
3. **Researches the public interview process** (take-home? system design? behavioural
   emphasis?) via swappable search providers — or honestly reports that nothing was found.
4. **Generates** a company brief, questions per category, and flashcards through **separate,
   deliberately-sequenced LLM calls** — the research findings change which categories and
   questions make sense.
5. **Runs a deterministic coverage check** in code (not the model) and loops a bounded number
   of times until every must-have requirement has a question.
6. **Allocates a schedule** across exactly the requested number of days, front-loading the
   hardest / highest-priority material.
7. **Validates** the whole kit against a Zod schema before it is ever saved or returned.

You can then **edit, reorder, add, delete, and regenerate any single section** without losing
your edits, and **practise** the flashcards with confidence-weighted repetition.

---

## Tech stack & why

| Choice | Why |
|---|---|
| **TypeScript (strict)** | The kit structure (Appendix A) is exact and non-negotiable. A single Zod schema gives us both compile-time types and runtime validation of every kit before it is saved or returned — the structure literally cannot drift from spec. |
| **Monorepo (npm workspaces)** | The pipeline lives in `packages/core` so the web app **and** the grader-facing batch CLI run *the same code path* — no risk of the demo and the batch diverging. |
| **Express (backend)** | Small, explicit, stateless HTTP layer. No framework magic to explain in an interview. |
| **Next.js (App Router) + Tailwind (frontend)** | Fast to build responsive, keyboard-navigable UI; App Router keeps auth-gated pages and the kit builder simple. |
| **MongoDB (Mongoose)** | The kit is a nested document with per-item state; a document store fits it naturally. Free tier (Atlas) for deploy. |
| **OpenAI-compatible LLM client** | Provider-agnostic: base URL + key + model come from env. The **submission default is a genuine free-tier provider (Groq)** so a clean clone runs with no paid account. DeepSeek/OpenRouter/etc. work by changing three env vars. |

**Determinism is deliberate:** the two things that must be *correct*, not *plausible* — schedule
allocation and coverage checking — are **pure code, never the model**.

---

## Repository layout

```
packages/core/   the shared engine — kit schema + validator, LLM client, retrieval
                 (crawler + interview research), extraction, generation, coverage,
                 schedule, pipeline orchestration, and the builder (state model).
apps/backend/    Express API + auth + persistence + the `npm run evaluate` batch CLI.
apps/web/        Next.js + Tailwind frontend.
fixtures/        local sample cases (cases.json) + real-company cases (real-cases.json).
```

The pipeline lives in `packages/core` so the web app and the batch CLI run **the same code**.

---

## Setup

**Requirements:** Node 20+, and a MongoDB instance (local Docker or Atlas free tier). The batch
CLI does **not** need a database.

```bash
# 1. Install
npm install

# 2. Configure — copy the template and fill in values (all documented inline)
cp .env.example .env

# 3. (optional) local MongoDB
docker run -d -p 27017:27017 --name ipk-mongo mongo:7

# 4. Verify the toolchain
npm run typecheck      # TypeScript, no emit
npm run lint           # ESLint
npm test               # Vitest — 175 tests
```

**Get a free LLM key:** the app is provider-agnostic — any OpenAI-compatible endpoint works by
setting `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. Two options:

- **Groq (free tier)** — `LLM_BASE_URL=https://api.groq.com/openai/v1`. Get a key at
  <https://console.groq.com> → *API Keys*.
- **DeepSeek** — `LLM_BASE_URL=https://api.deepseek.com`, `LLM_MODEL=deepseek-chat`. Key at
  <https://platform.deepseek.com>.

> **Note on the deployed instance:** Groq's free tier is **heavily rate-limited** (tokens-per-minute),
> and during testing the multi-call pipeline hits that limit and fails part-way. So the **public
> deployment uses DeepSeek** (`deepseek-chat`) for reliable end-to-end runs. Nothing in the code is
> DeepSeek-specific — it's the same three env vars; Groq still works for light/local use.

**Run the app locally:**

```bash
# backend (http://localhost:4000)
npm run dev --workspace @interview-prep-kit/backend

# frontend (http://localhost:3000, proxies /api → backend)
npm run dev --workspace @interview-prep-kit/web
```

All environment variables are documented in [`.env.example`](./.env.example). No secrets are
committed; `.env` is gitignored.

---

## The batch entry point (Appendix B)

The mandatory grader-facing command. It runs the **same `runPipeline`** as the app on each case,
uses each case's own `days`, continues after a failing case (recording a structured error rather
than aborting), and writes the exact Appendix B output shape:

```bash
npm run evaluate -- --input fixtures/cases.json --output kits.json
```

- Input: an array of cases (`id`, `jd`, `company_url`, `days`).
- Output: `{ version, generated_at, kits[] }`, each entry `{ id, status, kit? , error? }`.
- Every emitted `kit` is validated against the Appendix A schema before it is written.
- A clean clone reads `.env`; designed to complete 5 cases within 15 minutes including
  rate-limit back-off.

Additional (non-grader) harnesses used during development:

```bash
npm run evaluate:real     # runs against real companies, writes an auditable diagnostics report
npm run prove:research    # demonstrates interview-research findings change the generated kit
```

---

## Architecture

**State tiers.** The browser holds a fast optimistic working copy; **the server is stateless**
(read Mongo → run logic/LLM → write Mongo → forget); **MongoDB is the single source of truth**.
The server never holds a kit in RAM between requests, because a free-tier host may sleep, restart,
or run multiple instances.

**Restart-safe generation.** A long generation is tracked by a persisted
`GenerationJob { id, kitId, userId, status, stage, error?, … }` in Mongo — not in server RAM — so
the UI can recover by reading the job, and a **duplicate trigger finds the existing job**
(idempotency) instead of starting a second run.

> Honest limitation: the job *record* survives a restart, but there is **no background worker**
> that resumes an interrupted run. A job caught mid-flight by a restart is left in its last
> persisted state; it is not automatically re-executed. This is a documented trade-off, not a
> claim of full resumption.

**Auth.** Register / login / logout with scrypt password hashing and an HMAC-signed httpOnly
session cookie (Node `crypto` only — no native deps). Guards enforce that a signed-out visitor
cannot reach protected endpoints and that a user can read or modify **only their own kits**.

---

## The pipeline: how the stages are sequenced

Sequencing is **genuine**, not one megaprompt — different inputs need different handling, and
later stages depend on earlier findings:

```
extracting → crawling → interview-research → generating → covering → scheduling → validating → done
```

1. **extracting** — the pasted JD needs no retrieval; extract requirements with stable ids.
2. **crawling** — the homepage must be fetched and its links ranked to find what they do / how
   they hire.
3. **interview-research** — a separate stage that searches public discussion of the company's
   process. **Its findings are fed into generation**, so a *take-home + system-design* company
   produces a genuinely different kit than one with no public info (proven by `npm run
   prove:research`).
4. **generating** — separate calls per concern: company brief, questions **per category**,
   flashcards. Different requirement kinds → different question kinds.
5. **covering** — deterministic gap check + bounded targeted regeneration (below).
6. **scheduling** — deterministic arithmetic (below).
7. **validating** — `validateKit()` runs before the result is returned or saved. The pipeline
   *fails loudly* (`COVERAGE_INCOMPLETE`) rather than shipping an uncovered must-have.

Progress is emitted per stage; each failure is a coded `PipelineError`
(`INVALID_INPUT` / `EXTRACTION_FAILED` / `GENERATION_FAILED` / `COVERAGE_INCOMPLETE` /
`INVALID_KIT`). An unreachable source is **recorded and skipped, never fatal**.

---

## Retrieval approach & sources

**Company crawler (`packages/core/src/retrieval`).**
- **URL validation + SSRF guard** — rejects invalid, non-`http(s)`, and private/loopback hosts.
  `localhost` is only allowed when `ALLOW_LOCAL_URLS=true` (needed for the batch, whose sites may
  be served locally); **keep it `false` in production**.
- **`robots.txt` is respected** — a hard requirement, not optional.
- **Fetching is bounded** — content-type allowlist (`text/html`, `application/xhtml+xml`,
  `text/plain`), a size cap, a timeout, and **manual redirect following that re-runs the SSRF
  guard on every hop** so a public URL can't bounce to a private address.
- **Link ranking, not fixed paths** — the crawler fetches the homepage, scores links, and
  follows the promising ones (best-first, bounded depth/fetch count) to find a hiring/about page.
  A hardcoded `/careers` list is explicitly *not* used.

**Interview research (`packages/core/src/interview-research`).**
- A **swappable `SearchProvider`** interface (Null / Static / DuckDuckGo / Bing / HackerNews /
  Composite). The default composes HackerNews (Algolia JSON API), Bing, and DuckDuckGo, merging
  and de-duplicating results while preserving provider attribution.
- Results are fetched under the **same untrusted-input rules** as the crawler, then filtered by a
  **company-specific evidence gate** (the page must mention the company *and* contain a concrete
  process phrase) before signals are extracted. If nothing survives, the result is an explicit
  **"no public interview info"** state — never a fabricated process.
- **Sources are recorded** and surfaced in the kit's `company_brief.sources` / `source.pages_used`.

---

## Coverage second pass (the decision)

> The brief's bar: *a kit that ships with uncovered must-have requirements has failed at the one
> job it had.* The expected outcome is always `uncovered_requirement_ids: []`.

Done **in code, never the model**: `covered = ⋃ question.requirement_ids`;
`gaps = must-have ids − covered`. If there are gaps, we send a **targeted per-requirement
regeneration** (the exact id + text + kind — an easy, well-scoped task) and re-check.

**Stopping policy:**
- **Cap = 3 total passes** (1 draft + up to 2 targeted retries).
- **Early stop** if a pass closes zero new gaps (no progress → stop burning free-tier tokens).
- **Why 3:** generating a question for a *named* requirement is easy, so pass 1 covers almost
  everything and one targeted retry closes the rest; a small cap guarantees coverage without
  blowing the token/time budget.
- **Last-resort honesty:** if a real must-have still can't be covered after the cap, we do not
  fabricate or loop forever — the pipeline fails with `COVERAGE_INCOMPLETE` (and the id is
  recorded), the honest-failure path rather than the expected one.

---

## Schedule allocation

Pure arithmetic (`packages/core/src/schedule`), so it's provably correct and defensible:

- Distributes question ids across **exactly `days_available`** days.
- **Harder / higher-priority material lands earlier** (priority outranks difficulty), not the
  night before.
- Each day carries a `focus`, `question_ids`, and **integer** `minutes`.
- Handles the edges: **1 day** (everything, prioritised) and **60 days** (spread thin, exactly 60
  day entries). Invalid day counts raise a structured error.

Tested for `days ∈ {1, 3, 7, 60}` including the priority-over-difficulty invariant.

---

## The regeneration state model (the hard part)

The kit is a tree of independently-owned sections; regenerating one section touches only that
section. Every editable item (question, flashcard, brief field) is a **first-class record**, not
a nested blob:

```
Item { id, content, origin: generated|user, state: generated|edited|pinned,
       requirement_ids, section, order }
```

| state | on regenerate |
|---|---|
| `generated` (AI, untouched) | **replaceable** |
| `edited` (user changed it) | **protected — survives** |
| `pinned` (user locked it) | **protected — survives** |
| `origin: user` (hand-added) | **protected — auto-pinned** |

Any AI item the user touches flips `generated → edited` and is instantly protected.

**Merge on "regenerate section X":** keep protected items in X (in their current `order`), drop
the old `generated` items, insert the freshly generated ones (**new ids**), and leave every other
section byte-for-byte unchanged. Because regeneration mints new ids and never re-adds old ones, a
**deleted item cannot silently reappear**.

**How it is protected — architecture, not just storage:**
- **The server owns the merge.** Regeneration is a server command
  (`POST /kits/:id/sections/:section/regenerate`); the client sends **no kit payload**. The server
  reads the persisted kit, merges in `packages/core`, and saves. The client never PUTs the whole
  kit back — this eliminates the entire "regen clobbered my edit" class of bugs.
- **Item-level writes.** Edit / reorder / move is a `PATCH` on one item, never a whole-kit
  overwrite.
- **One-way-to-protected, server-enforced.** The client can't set an item back to `generated`.
- **Optimistic UI, server truth.** An edit racing a regeneration is already `edited` in the DB, so
  the merge protects it.
- **Lifecycle vs. position are independent axes** (`state` vs. `order`/`section`) — a reorder
  never touches lifecycle; a regeneration never resets order.

---

## Practice mode

Step through flashcards one at a time, reveal the answer, and record confidence. The next session
is ordered **least-confident-first** (a confidence-weighted sort) so weak spots resurface — chosen
over pure random or fixed order because spaced, weakness-targeted repetition is what actually moves
recall before an interview.

---

## Security

Untrusted input — the pasted JD and every crawled page — is treated as **content to process,
never instructions to follow**:

- **SSRF guard** on the initial URL and **on every redirect hop**; private/loopback rejected in
  production.
- **Content-type allowlist + size cap + timeout** on every fetch.
- **Prompt-injection-as-data:** every LLM-facing stage frames the input in a system message as
  *untrusted data, not instructions*; the JD/page text is delivered as a user-role payload, and
  the output is governed by a Zod schema, not by text smuggled inside the input.
- **Auth:** httpOnly signed sessions, ownership guards, `secureCookies` in production.

These are exercised as one auditable checklist in `packages/core/src/edge-cases.test.ts`.

---

## Testing

`npm test` — **175 tests** (Vitest). The behaviour most worth protecting has direct coverage:

- **Kit schema validation** — valid kit passes; float duration, dangling reference, bad enum, and
  missing field each fail with a clear message.
- **Coverage gap detector** — planted uncovered must-have is detected; a hallucinated id is
  rejected; the bounded loop closes gaps and reports honestly at the cap.
- **Schedule allocation** — invariants for `days ∈ {1, 3, 7, 60}`.
- **LLM client** — backoff on 429-then-200, JSON validation/repair.
- **Retrieval** — SSRF/private classification, robots, redirect re-validation, dead-link skip.
- **Pipeline** — end-to-end against an offline fixture site; mid-run source failure recorded not
  fatal.
- **API** — auth guards (401 signed-out, 403 on another user's kit), create→persist→reopen,
  regenerate-preserves-edits.
- **Edge cases & security** — the §10/§11 checklist above.

---

## Deployment

Deployment-agnostic by design (env-driven, no hardcoded hosts). Target topology:

| Piece | Host | Notes |
|---|---|---|
| Frontend (`apps/web`) | Vercel | `BACKEND_URL` → the backend's public URL; `/api/*` is proxied. |
| Backend (`apps/backend`) | Render (or Railway) | Set all `.env` vars; `ALLOW_LOCAL_URLS=false`; `secureCookies` on. |
| Database | MongoDB Atlas (free tier) | `MONGODB_URI` from Atlas. |

> Status: the code is deploy-ready and env-driven; the live deploy + public smoke test is the one
> remaining action for this step.

---

## Trade-offs & known limits

Documented honestly rather than hidden:

- **No background job worker.** A `GenerationJob` record survives a restart, but an interrupted run
  is not auto-resumed (see [Architecture](#architecture)). Acceptable for a single-instance free
  tier; a queue/worker would be the production fix.
- **Live interview-discussion sources are often unfetchable from a server IP.** Sites like Quora,
  Glassdoor, and Hacker News frequently block or challenge non-browser requests, so real public
  evidence can be sparse when run headless. The pipeline degrades honestly (`found: false`) rather
  than inventing a process; providers are swappable if a better search backend is available.
- **The prompt-injection test proves plumbing, not model behaviour.** It verifies untrusted text is
  delivered as data under an untrusted-flagging system prompt and that output stays schema-governed;
  it cannot prove a live model's resistance (the LLM is stubbed in tests).
- **Company-name matching is heuristic.** A company whose name is a common word can occasionally
  match unrelated pages; the evidence gate reduces but does not eliminate this.
- **Frontend animations are build-verified, not visually verified** in this environment (no
  browser); routes compile and typecheck cleanly.
