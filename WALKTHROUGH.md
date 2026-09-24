# Walkthrough script (3–4 min)

A tight demo that hits every scored area. Times are cumulative. Speak to the
*why*, not just the *what* — the brief rewards understanding.

---

### 0:00 — Framing (20s)
> "This turns a job description plus a company URL into a personalised interview
> prep kit. The important design choice: the two things that must be *correct* —
> covering every must-have requirement, and building the schedule — are pure
> code, never the model. The model does language; code does the guarantees."

### 0:20 — Create a kit (40s) — *shows sequencing + research*
- Paste a real JD, a company URL, set days = 7, submit.
- Point at the **progress stages**: `extracting → crawling → interview-research →
  generating → covering → scheduling → validating`.
> "These are genuinely separate stages. The company research and public interview
> research are fed *into* generation — so a company with a take-home + system-design
> process produces a different kit than one with nothing public. That's `npm run
> prove:research`."

### 1:00 — The kit (40s) — *extraction + coverage + research influence*
- Show **requirements** marked must/nice; note nothing invented.
- Show **question categories** (technical / behavioural / system-design / company-fit).
- Point at **coverage: `uncovered_requirement_ids: []`**.
> "Coverage is checked in code — must-have ids minus covered ids. If there's a gap,
> we send a targeted regeneration for that exact requirement and re-check, capped at
> three passes. A kit never ships with an uncovered must-have; if it truly can't
> cover one, it fails loudly rather than faking it."

### 1:40 — The schedule (25s) — *deterministic arithmetic*
- Show the day-by-day plan.
> "Exactly the requested number of days, integer minutes, and the hardest and
> highest-priority material is front-loaded — not left for the night before. It's
> arithmetic, so it's provably correct."

### 2:05 — The builder — the hard part (50s) — *state model*
- Edit a Technical question → **regenerate the Technical section** → the edited
  question **survives at its position**; the others refresh with new ids.
- Delete one → regenerate → it **does not reappear**.
> "Every item has state — generated, edited, or pinned. The moment you touch an AI
> item it becomes protected. And the merge runs on the *server* against the DB copy —
> the client never sends the whole kit back — so a regeneration can't clobber an edit,
> even one made mid-generation."

### 2:55 — Practice mode (20s) — *creative feature*
- Flip a few flashcards, rate confidence.
> "Next session orders least-confident first, so weak spots resurface."

### 3:15 — Robustness & security (30s) — *the data you don't control*
- Mention: unreachable site is recorded, not fatal; SSRF guard rejects private
  addresses and re-checks every redirect; content-type and size are bounded; the
  JD and every page are treated as untrusted *data*, framed as "not instructions".
> "There's one auditable test file for all of this, plus 175 tests overall."

### 3:45 — Close (15s)
> "Same pipeline runs the app and the mandatory batch command, so the demo and the
> grader run identical code. Trade-offs and known limits are all in the README."

---

## Pre-demo checklist
- [ ] `.env` has a working `LLM_API_KEY` (Groq free tier).
- [ ] MongoDB reachable (`docker run -d -p 27017:27017 mongo:7`).
- [ ] Backend + frontend running; one account registered.
- [ ] One kit pre-generated (generation takes ~60–90s — don't wait for it live).
- [ ] A second browser tab on `npm run prove:research` output, if showing research influence.
