'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import type { Kit, Question } from '@interview-prep-kit/core';
import { api, ApiError, type KitResponse, type QuestionCategory } from '@/lib/api';
import { PracticeMode } from '@/components/PracticeMode';
import { SpotlightCard } from '@/components/ui/spotlight-card';

const CATEGORIES: QuestionCategory[] = ['technical', 'behavioural', 'system-design', 'company-fit'];
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'questions', label: 'Questions' },
  { key: 'flashcards', label: 'Flashcards' },
  { key: 'schedule', label: 'Study plan' },
  { key: 'practice', label: 'Practice' },
];
type Tab = 'overview' | 'questions' | 'flashcards' | 'schedule' | 'practice';

function meta(item: Record<string, unknown>): { state: string; origin: string; order: number } {
  return {
    state: typeof item.state === 'string' ? item.state : 'generated',
    origin: typeof item.origin === 'string' ? item.origin : 'generated',
    order: typeof item.order === 'number' ? item.order : Number.MAX_SAFE_INTEGER,
  };
}
function StateBadge({ item }: { item: Record<string, unknown> }) {
  const m = meta(item);
  const label = m.origin === 'user' ? 'yours' : m.state === 'edited' ? 'edited' : m.state === 'pinned' ? 'pinned' : null;
  if (!label) return null;
  const cls = label === 'yours' ? 'bg-brass-tint text-[#795D15]' : 'bg-navy-tint text-navy';
  return <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>;
}

function Chevron({ open, className = '' }: { open: boolean; className?: string }) {
  return (
    <motion.svg animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }} className={`h-4 w-4 ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  );
}

const DIFFICULTY: Record<number, { label: string; cls: string }> = {
  1: { label: 'Easy', cls: 'bg-pine/10 text-pine ring-pine/25' },
  2: { label: 'Medium', cls: 'bg-brass/10 text-brass ring-brass/30' },
  3: { label: 'Hard', cls: 'bg-clay/10 text-clay ring-clay/25' },
};

export default function KitDetailPage() {
  const router = useRouter();
  const id = String(useParams().id);
  const [kit, setKit] = useState<Kit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setKit((await api.getKit(id)).kit);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) router.push('/login');
        else setError(err instanceof ApiError ? err.message : 'Could not load this kit.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const apply = (res: KitResponse) => setKit(res.kit);
  async function run(label: string, fn: () => Promise<KitResponse>) {
    setBusy(label);
    setError(null);
    try {
      apply(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That action didn’t go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !kit) return <Shell><p className="text-clay">{error}</p></Shell>;
  if (!kit) return <Shell><p className="text-ink-soft">Loading…</p></Shell>;

  const questionsIn = (cat: QuestionCategory) =>
    kit.questions.filter((q) => q.category === cat).sort((a, b) => meta(a).order - meta(b).order);

  return (
    <Shell>
      <div>
        <Link href="/kits" className="inline-flex items-center gap-1.5 text-sm text-ink-faint transition hover:text-ink">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          All kits
        </Link>
        <h1 className="mt-3 font-display text-3xl tracking-tightest text-ink sm:text-4xl">{kit.role.title || 'Role'}</h1>
        <p className="mt-1 text-ink-soft">{kit.source.company || 'Company'}</p>
      </div>
      {error && <p className="mt-3 text-sm text-clay">{error}</p>}

      <nav className="mt-7 flex flex-wrap gap-x-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`relative px-3 py-2.5 text-sm transition ${tab === t.key ? 'font-medium text-ink' : 'text-ink-faint hover:text-ink'}`}>
            {t.label}
            {tab === t.key && <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-navy" />}
          </button>
        ))}
      </nav>

      <div className="mt-7">
        {tab === 'overview' && <Overview kit={kit} run={run} busy={busy} />}
        {tab === 'questions' && (
          <div className="space-y-9">
            {CATEGORIES.map((cat) => {
              const qs = questionsIn(cat);
              return (
                <section key={cat}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-display text-lg capitalize tracking-tight text-ink">
                      {cat.replace('-', ' ')} <span className="font-sans text-sm font-normal text-ink-faint">· {qs.length}</span>
                    </h2>
                    <button onClick={() => run(`regen-${cat}`, () => api.regenerate(id, cat))} disabled={busy !== null} className="btn-quiet">
                      {busy === `regen-${cat}` ? 'Regenerating…' : 'Regenerate'}
                    </button>
                  </div>
                  <ul className="space-y-2.5">
                    {qs.map((q, i) => (
                      <QuestionRow
                        key={q.id}
                        kitId={id}
                        q={q}
                        canUp={i > 0}
                        canDown={i < qs.length - 1}
                        onReorderSwap={(dir) => {
                          const ids = qs.map((x) => x.id);
                          const j = dir === 'up' ? i - 1 : i + 1;
                          [ids[i], ids[j]] = [ids[j], ids[i]];
                          void run('reorder', () => api.reorder(id, cat, ids));
                        }}
                        onChanged={apply}
                      />
                    ))}
                  </ul>
                  <AddQuestion kitId={id} category={cat} onAdded={apply} />
                </section>
              );
            })}
          </div>
        )}
        {tab === 'flashcards' && <Flashcards kit={kit} kitId={id} run={run} onChanged={apply} busy={busy} />}
        {tab === 'schedule' && <Schedule kit={kit} onRegen={() => run('regen-schedule', () => api.regenerate(id, 'schedule'))} busy={busy === 'regen-schedule'} />}
        {tab === 'practice' && <PracticeMode kitId={id} flashcards={kit.flashcards} />}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 sm:py-12">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/kits" className="flex items-center gap-2.5">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-navy text-[13px] font-semibold text-white">ip</span>
          <span className="font-display text-[15px] text-ink">Interview Prep Kit</span>
        </Link>
      </header>
      {children}
    </main>
  );
}

function Overview({ kit, run, busy }: { kit: Kit; run: (l: string, fn: () => Promise<KitResponse>) => void; busy: string | null }) {
  const id = String(useParams().id);
  const [summary, setSummary] = useState(kit.company_brief.summary);
  const [what, setWhat] = useState(kit.company_brief.what_they_do);
  const dirty = summary !== kit.company_brief.summary || what !== kit.company_brief.what_they_do;
  return (
    <div className="space-y-6">
      <SpotlightCard variant="key" className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-tight text-ink">Company brief <StateBadge item={kit.company_brief as unknown as Record<string, unknown>} /></h2>
          <button onClick={() => run('regen-brief', () => api.regenerate(id, 'company_brief'))} disabled={busy !== null} className="btn-quiet">
            {busy === 'regen-brief' ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
        <label className="kicker mb-1.5 block">Summary</label>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="field mb-4 leading-relaxed" rows={3} />
        <label className="kicker mb-1.5 block">What they do</label>
        <textarea value={what} onChange={(e) => setWhat(e.target.value)} className="field leading-relaxed" rows={2} />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => run('save-brief', () => api.editBrief(id, { summary, what_they_do: what }))} disabled={!dirty || busy !== null} className="btn-primary px-4 py-2 text-xs">
            {busy === 'save-brief' ? 'Saving…' : 'Save brief'}
          </button>
          {dirty && <span className="text-xs text-ink-faint">Unsaved changes</span>}
        </div>
        {kit.company_brief.sources.length > 0 && (
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">
            Sources: {kit.company_brief.sources.join(', ')}
          </p>
        )}
      </SpotlightCard>

      <SpotlightCard className="p-6">
        <h2 className="mb-4 font-display text-lg tracking-tight text-ink">
          Requirements <span className="font-sans text-sm font-normal text-ink-faint">· {kit.role.requirements.length}</span>
        </h2>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-xs text-ink-faint">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Requirement</th>
              </tr>
            </thead>
            <tbody>
              {kit.role.requirements.map((r) => (
                <tr key={r.id} className="border-t border-line align-top first:border-t-0">
                  <td className="px-3 py-2.5"><span className="chip-id">{r.id}</span></td>
                  <td className="px-3 py-2.5">
                    {r.priority === 'must'
                      ? <span className="rounded bg-navy px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">must</span>
                      : <span className="text-ink-faint">nice</span>}
                  </td>
                  <td className="px-3 py-2.5 capitalize text-ink-soft">{r.kind}</td>
                  <td className="px-3 py-2.5 text-ink">{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SpotlightCard>
    </div>
  );
}

function QuestionRow({
  kitId, q, canUp, canDown, onReorderSwap, onChanged,
}: {
  kitId: string; q: Question; canUp: boolean; canDown: boolean;
  onReorderSwap: (dir: 'up' | 'down') => void; onChanged: (res: KitResponse) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [answer, setAnswer] = useState(q.answer_outline);
  const pinned = meta(q as unknown as Record<string, unknown>).state === 'pinned';
  const diff = DIFFICULTY[q.difficulty] ?? DIFFICULTY[2];

  return (
    <motion.li layout className={`panel p-4 text-sm transition-shadow hover:shadow-lift ${pinned ? 'ring-1 ring-inset ring-brass/30' : ''}`}>
      {editing ? (
        <>
          <label className="kicker mb-1.5 block">Question</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="field mb-3.5" rows={2} />
          <label className="kicker mb-1.5 block">Answer outline</label>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="field mb-3.5 leading-relaxed" rows={4} />
          <div className="flex items-center gap-3">
            <button onClick={async () => { onChanged(await api.editQuestion(kitId, q.id, { prompt, answer_outline: answer })); setEditing(false); }} className="btn-primary px-4 py-2 text-xs">Save</button>
            <button onClick={() => { setPrompt(q.prompt); setAnswer(q.answer_outline); setEditing(false); }} className="btn-text text-xs">Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium leading-relaxed text-ink">{q.prompt}</p>
            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${diff.cls}`}>{diff.label}</span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {q.requirement_ids.length ? (
              q.requirement_ids.map((r) => <span key={r} className="chip-id">{r}</span>)
            ) : (
              <span className="text-[11px] text-ink-faint">No requirement linked</span>
            )}
            <StateBadge item={q as unknown as Record<string, unknown>} />
          </div>

          <button onClick={() => setShowAnswer((s) => !s)} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-navy transition hover:text-navy-hover" aria-expanded={showAnswer}>
            <Chevron open={showAnswer} className="h-3.5 w-3.5" />
            {showAnswer ? 'Hide answer outline' : 'Show answer outline'}
          </button>
          <AnimatePresence initial={false}>
            {showAnswer && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                <p className="mt-2.5 whitespace-pre-wrap rounded-lg border border-line bg-paper/60 p-3.5 leading-relaxed text-ink-soft">
                  {q.answer_outline || 'No answer outline yet.'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-3.5 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs text-ink-faint">
            <button onClick={() => setEditing(true)} className="transition hover:text-ink">Edit</button>
            <button onClick={async () => onChanged(await api.pinQuestion(kitId, q.id, !pinned))} className={pinned ? 'font-medium text-brass transition hover:text-brass-bright' : 'transition hover:text-ink'}>{pinned ? 'Unpin' : 'Pin'}</button>
            <button onClick={async () => onChanged(await api.deleteQuestion(kitId, q.id))} className="text-clay/80 transition hover:text-clay">Delete</button>
            <span className="ml-auto flex items-center gap-1.5">
              <button disabled={!canUp} onClick={() => onReorderSwap('up')} className="rounded p-1 transition hover:bg-paper disabled:opacity-30" aria-label="Move up">
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M4 10 8 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button disabled={!canDown} onClick={() => onReorderSwap('down')} className="rounded p-1 transition hover:bg-paper disabled:opacity-30" aria-label="Move down">
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <select value={q.category} onChange={async (e) => onChanged(await api.moveQuestion(kitId, q.id, e.target.value as QuestionCategory))} className="rounded-md border border-line bg-white px-1.5 py-1 text-xs capitalize text-ink-soft outline-none transition focus:border-navy" aria-label="Move to category">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('-', ' ')}</option>)}
              </select>
            </span>
          </div>
        </>
      )}
    </motion.li>
  );
}

function AddQuestion({ kitId, category, onAdded }: { kitId: string; category: QuestionCategory; onAdded: (res: KitResponse) => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="mt-3 text-xs font-medium text-ink-faint transition hover:text-navy">+ Add your own question</button>;
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line-strong p-3">
      <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Type a question you want to practise…" className="field mb-2.5" />
      <div className="flex items-center gap-3">
        <button onClick={async () => { onAdded(await api.addQuestion(kitId, { category, requirement_ids: [], prompt, answer_outline: '', difficulty: 2 })); setPrompt(''); setOpen(false); }} disabled={!prompt.trim()} className="btn-primary px-4 py-2 text-xs">Add question</button>
        <button onClick={() => { setPrompt(''); setOpen(false); }} className="btn-text text-xs">Cancel</button>
      </div>
    </div>
  );
}

function Flashcards({ kit, kitId, run, onChanged, busy }: { kit: Kit; kitId: string; run: (l: string, fn: () => Promise<KitResponse>) => void; onChanged: (res: KitResponse) => void; busy: string | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg tracking-tight text-ink">
          Flashcards <span className="font-sans text-sm font-normal text-ink-faint">· {kit.flashcards.length}</span>
        </h2>
        <button onClick={() => run('regen-flashcards', () => api.regenerate(kitId, 'flashcards'))} disabled={busy !== null} className="btn-quiet">
          {busy === 'regen-flashcards' ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>
      {kit.flashcards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-ink-soft">No flashcards yet — regenerate the set or add your own below.</p>
      ) : (
        <ul className="space-y-2.5">
          {kit.flashcards.map((f) => <FlashcardRow key={f.id} kitId={kitId} f={f} onChanged={onChanged} />)}
        </ul>
      )}
      <AddFlashcard kitId={kitId} onAdded={onChanged} />
    </div>
  );
}

function FlashcardRow({ kitId, f, onChanged }: { kitId: string; f: Kit['flashcards'][number]; onChanged: (res: KitResponse) => void }) {
  const [show, setShow] = useState(false);
  return (
    <motion.li layout className="panel p-4 text-sm transition-shadow hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium leading-relaxed text-ink">{f.front}</p>
        <StateBadge item={f as unknown as Record<string, unknown>} />
      </div>
      <button onClick={() => setShow((s) => !s)} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-navy transition hover:text-navy-hover" aria-expanded={show}>
        <Chevron open={show} className="h-3.5 w-3.5" />
        {show ? 'Hide answer' : 'Show answer'}
      </button>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <p className="mt-2.5 whitespace-pre-wrap rounded-lg border border-line bg-paper/60 p-3.5 leading-relaxed text-ink-soft">{f.back}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-3.5 border-t border-line pt-3 text-xs">
        <button onClick={async () => onChanged(await api.deleteFlashcard(kitId, f.id))} className="text-clay/80 transition hover:text-clay">Delete</button>
      </div>
    </motion.li>
  );
}

function AddFlashcard({ kitId, onAdded }: { kitId: string; onAdded: (res: KitResponse) => void }) {
  const [open, setOpen] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs font-medium text-ink-faint transition hover:text-navy">+ Add your own flashcard</button>;
  return (
    <div className="space-y-2.5 rounded-xl border border-dashed border-line-strong p-3.5">
      <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front — the prompt" className="field" />
      <textarea value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back — the answer" className="field leading-relaxed" rows={3} />
      <div className="flex items-center gap-3">
        <button onClick={async () => { onAdded(await api.addFlashcard(kitId, { front, back, requirement_ids: [] })); setFront(''); setBack(''); setOpen(false); }} disabled={!front.trim()} className="btn-primary px-4 py-2 text-xs">Add flashcard</button>
        <button onClick={() => { setFront(''); setBack(''); setOpen(false); }} className="btn-text text-xs">Cancel</button>
      </div>
    </div>
  );
}

function Schedule({ kit, onRegen, busy }: { kit: Kit; onRegen: () => void; busy: boolean }) {
  const byId = new Map(kit.questions.map((q) => [q.id, q]));
  const totalMin = kit.schedule.days.reduce((s, d) => s + d.minutes, 0);
  const totalQ = kit.schedule.days.reduce((s, d) => s + d.question_ids.length, 0);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const totalLabel = `${hrs ? `${hrs}h ` : ''}${mins}m`;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg tracking-tight text-ink">Study plan</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {totalQ} questions across {kit.schedule.days_available} days, about {totalLabel} of study — hardest material first.
          </p>
        </div>
        <button onClick={onRegen} disabled={busy} className="btn-quiet shrink-0">{busy ? 'Regenerating…' : 'Regenerate'}</button>
      </div>
      <ol className="space-y-2.5">
        {kit.schedule.days.map((d) => <DayCard key={d.day} d={d} byId={byId} />)}
      </ol>
      <p className="text-xs leading-relaxed text-ink-faint">
        Days are set when you create the kit. Regenerate re-allocates the plan, front-loading the hardest and highest-priority material.
      </p>
    </div>
  );
}

function DayCard({ d, byId }: { d: Kit['schedule']['days'][number]; byId: Map<string, Question> }) {
  const [open, setOpen] = useState(false);
  const qs = d.question_ids.map((qid) => byId.get(qid)).filter((q): q is Question => Boolean(q));
  const empty = qs.length === 0;
  return (
    <motion.li layout className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <button onClick={() => !empty && setOpen((o) => !o)} className={`flex w-full items-center gap-4 p-4 text-left ${empty ? 'cursor-default' : ''}`} aria-expanded={open}>
        <span className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${empty ? 'bg-paper text-ink-faint' : 'bg-navy text-white'}`}>
          <span className="text-[9px] uppercase leading-none opacity-70">Day</span>
          <span className="font-display text-lg leading-tight">{d.day}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{d.focus || (empty ? 'Rest / light review' : 'Review')}</span>
          <span className="text-sm text-ink-faint">{qs.length} question{qs.length === 1 ? '' : 's'} · {d.minutes} min</span>
        </span>
        {!empty && <Chevron open={open} className="text-ink-faint" />}
      </button>
      <AnimatePresence initial={false}>
        {open && !empty && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <ul className="space-y-2.5 border-t border-line px-4 py-3.5">
              {qs.map((q) => {
                const diff = DIFFICULTY[q.difficulty] ?? DIFFICULTY[2];
                return (
                  <li key={q.id} className="flex items-start gap-2.5 text-sm text-ink-soft">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1 ring-inset ${diff.cls}`}>{diff.label}</span>
                    <span className="leading-snug">{q.prompt}</span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
