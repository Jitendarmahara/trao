# AI Interview Prep Kit

Turns a pasted **job description** + a **company website** + a **number of days** into a
personalised interview prep kit — a company brief, a role breakdown, a categorised question
bank, flashcards, and a day-by-day study schedule — then lets you reshape it and practise
against it.

> Trao Full-Stack Engineering Assessment (`FS-AI-INTERVIEW-01`).

## Status

🚧 In development, built step by step. See `docs`/commit history for progress.

- [x] **Step 0** — Project scaffolding & tooling
- [ ] Step 1 — Kit schema + validator (Appendix A)
- [ ] Step 2 — LLM client (rate-limit + backoff)
- [ ] Step 3 — Crawler + interview research
- [ ] Step 4 — Requirement extraction
- [ ] Step 5 — Generation
- [ ] Step 6 — Coverage second pass
- [ ] Step 7 — Schedule allocation
- [ ] Step 8 — Pipeline orchestration
- [ ] Step 9 — Batch entry point (`npm run evaluate`)
- [ ] Step 10 — Persistence + auth + API
- [ ] Step 11 — Regeneration state model
- [ ] Step 12 — Frontend (Next.js)
- [ ] Step 13 — Edge cases & security
- [ ] Step 14 — README, tests, deploy, walkthrough

## Tech stack

- **Language:** TypeScript (strict)
- **Frontend:** Next.js + Tailwind CSS (`apps/web`) — _added at Step 12_
- **Backend:** Node.js + Express (`apps/backend`)
- **Database:** MongoDB
- **LLM:** OpenAI-compatible client — submission default is a **genuine free-tier** provider
  (Groq); works with any compatible provider (DeepSeek, OpenRouter, …) by changing 3 env vars.

## Repository layout

```
packages/core/   the shared engine (pipeline, schema, crawler, generation, coverage, schedule)
apps/backend/    Express API + the `npm run evaluate` batch CLI
apps/web/        Next.js frontend (added at Step 12)
fixtures/        local fake company site + sample cases for testing
```

The pipeline lives in `packages/core` so the web app and the batch CLI run **the same code**.

## Setup (local)

```bash
# 1. Install dependencies (Node 20+)
npm install

# 2. Configure environment
cp .env.example .env      # then fill in values (see comments in the file)
```

## Scripts

```bash
npm run typecheck    # TypeScript, no emit
npm run lint         # ESLint
npm run format       # Prettier (write)
npm test             # Vitest
```

## Environment variables

All variables are documented in [`.env.example`](./.env.example). The LLM key defaults to a
genuine free-tier provider so the project runs with no paid account.

---

_This README grows as the project does; architecture, retrieval approach, state model,
schedule allocation, and deployment are documented as those steps are built._
