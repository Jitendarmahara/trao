'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import type { Kit, Question } from '@interview-prep-kit/core';
import { api, ApiError, type KitResponse, type QuestionCategory } from '@/lib/api';
import { PracticeMode } from '@/components/PracticeMode';
import { SpotlightCard } from '@/components/ui/spotlight-card';

const CATEGORIES: QuestionCategory[] = ['technical', 'behavioural', 'system-design', 'company-fit'];
const TABS = ['overview', 'questions', 'flashcards', 'schedule', 'practice'] as const;
type Tab = (typeof TABS)[number];

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
  return <span className="ml-2 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">{label}</span>;
}
const input = 'w-full rounded-lg border border-zinc-700 bg-zinc-950/60 p-2 text-sm outline-none focus:border-violet-500';
const ghostBtn = 'rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800';

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
        else setError(err instanceof ApiError ? err.message : 'Could not load kit.');
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
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !kit) return <Shell><p className="text-red-400">{error}</p></Shell>;
  if (!kit) return <Shell><p className="text-zinc-500">Loading…</p></Shell>;

  const questionsIn = (cat: QuestionCategory) =>
    kit.questions.filter((q) => q.category === cat).sort((a, b) => meta(a).order - meta(b).order);

  return (
    <Shell>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 24 }}>
        <Link href="/kits" className="mono text-xs text-zinc-500 hover:text-zinc-300">← all kits</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {kit.role.title || 'Role'} <span className="serif font-normal text-violet-400">· {kit.source.company || 'Company'}</span>
        </h1>
      </motion.div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`relative px-3 py-2 text-sm capitalize ${tab === t ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t}
            {tab === t && <motion.span layoutId="tab-underline" className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-violet-500" />}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'overview' && <Overview kit={kit} run={run} />}
        {tab === 'questions' && (
          <div className="space-y-8">
            {CATEGORIES.map((cat) => {
              const qs = questionsIn(cat);
              return (
                <section key={cat}>
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-semibold capitalize">{cat.replace('-', ' ')} <span className="text-zinc-500">({qs.length})</span></h2>
                    <button onClick={() => run(`regen-${cat}`, () => api.regenerate(id, cat))} disabled={busy !== null} className={ghostBtn}>
                      {busy === `regen-${cat}` ? 'Regenerating…' : 'Regenerate'}
                    </button>
                  </div>
                  <ul className="space-y-2">
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
        {tab === 'flashcards' && <Flashcards kit={kit} kitId={id} run={run} onChanged={apply} />}
        {tab === 'schedule' && <Schedule kit={kit} onRegen={() => run('regen-schedule', () => api.regenerate(id, 'schedule'))} busy={busy === 'regen-schedule'} />}
        {tab === 'practice' && <PracticeMode kitId={id} flashcards={kit.flashcards} />}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>;
}

function Overview({ kit, run }: { kit: Kit; run: (l: string, fn: () => Promise<KitResponse>) => void }) {
  const id = String(useParams().id);
  const [summary, setSummary] = useState(kit.company_brief.summary);
  const [what, setWhat] = useState(kit.company_brief.what_they_do);
  return (
    <div className="space-y-6">
      <SpotlightCard className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Company brief <StateBadge item={kit.company_brief as unknown as Record<string, unknown>} /></h2>
          <button onClick={() => run('regen-brief', () => api.regenerate(id, 'company_brief'))} className={ghostBtn}>Regenerate</button>
        </div>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className={`${input} mb-2`} rows={3} />
        <textarea value={what} onChange={(e) => setWhat(e.target.value)} className={input} rows={2} />
        <button onClick={() => run('save-brief', () => api.editBrief(id, { summary, what_they_do: what }))} className="mt-2 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">Save brief</button>
        {kit.company_brief.sources.length > 0 && <p className="mt-2 mono text-xs text-zinc-500">sources: {kit.company_brief.sources.join(', ')}</p>}
      </SpotlightCard>
      <SpotlightCard className="p-5">
        <h2 className="mb-3 font-semibold">Requirements</h2>
        <table className="w-full text-left text-sm">
          <thead><tr className="mono text-xs uppercase text-zinc-500"><th className="pb-2">ID</th><th>Priority</th><th>Kind</th><th>Requirement</th></tr></thead>
          <tbody>
            {kit.role.requirements.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800">
                <td className="py-1.5 pr-2 mono text-xs text-violet-300">{r.id}</td>
                <td className="pr-2">{r.priority}</td>
                <td className="pr-2 text-zinc-400">{r.kind}</td>
                <td>{r.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [prompt, setPrompt] = useState(q.prompt);
  const [answer, setAnswer] = useState(q.answer_outline);
  const pinned = meta(q as unknown as Record<string, unknown>).state === 'pinned';
  return (
    <motion.li layout className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
      {editing ? (
        <>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className={`${input} mb-2`} rows={2} />
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className={`${input} mb-2 text-zinc-400`} rows={3} />
          <button onClick={async () => { onChanged(await api.editQuestion(kitId, q.id, { prompt, answer_outline: answer })); setEditing(false); }} className="mr-2 rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-zinc-500">Cancel</button>
        </>
      ) : (
        <>
          <p className="font-medium">
            {q.prompt}
            <StateBadge item={q as unknown as Record<string, unknown>} />
            <span className="ml-2 mono text-[10px] text-zinc-500">d{q.difficulty} · {q.requirement_ids.join(',') || '—'}</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-zinc-400">{q.answer_outline}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <button onClick={() => setEditing(true)} className="hover:text-zinc-100">Edit</button>
            <button onClick={async () => onChanged(await api.pinQuestion(kitId, q.id, !pinned))} className="hover:text-zinc-100">{pinned ? 'Unpin' : 'Pin'}</button>
            <button onClick={async () => onChanged(await api.deleteQuestion(kitId, q.id))} className="text-red-400 hover:text-red-300">Delete</button>
            <button disabled={!canUp} onClick={() => onReorderSwap('up')} className="disabled:opacity-30">↑</button>
            <button disabled={!canDown} onClick={() => onReorderSwap('down')} className="disabled:opacity-30">↓</button>
            <select value={q.category} onChange={async (e) => onChanged(await api.moveQuestion(kitId, q.id, e.target.value as QuestionCategory))} className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-xs" aria-label="Move to category">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </>
      )}
    </motion.li>
  );
}

function AddQuestion({ kitId, category, onAdded }: { kitId: string; category: QuestionCategory; onAdded: (res: KitResponse) => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-xs text-zinc-500 hover:text-violet-300">+ Add question</button>;
  return (
    <div className="mt-2 rounded-xl border border-dashed border-zinc-700 p-2">
      <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Your question…" className={`${input} mb-2`} />
      <button onClick={async () => { onAdded(await api.addQuestion(kitId, { category, requirement_ids: [], prompt, answer_outline: '', difficulty: 2 })); setPrompt(''); setOpen(false); }} className="rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white">Add</button>
    </div>
  );
}

function Flashcards({ kit, kitId, run, onChanged }: { kit: Kit; kitId: string; run: (l: string, fn: () => Promise<KitResponse>) => void; onChanged: (res: KitResponse) => void }) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Flashcards ({kit.flashcards.length})</h2>
        <button onClick={() => run('regen-flashcards', () => api.regenerate(kitId, 'flashcards'))} className={ghostBtn}>Regenerate</button>
      </div>
      <ul className="space-y-2">
        {kit.flashcards.map((f) => (
          <motion.li layout key={f.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
            <p className="font-medium">{f.front}<StateBadge item={f as unknown as Record<string, unknown>} /></p>
            <p className="mt-1 text-zinc-400">{f.back}</p>
            <button onClick={async () => onChanged(await api.deleteFlashcard(kitId, f.id))} className="mt-1 text-xs text-red-400 hover:text-red-300">Delete</button>
          </motion.li>
        ))}
      </ul>
      <div className="rounded-xl border border-dashed border-zinc-700 p-2">
        <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front" className={`${input} mb-2`} />
        <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back" className={`${input} mb-2`} />
        <button onClick={async () => { onChanged(await api.addFlashcard(kitId, { front, back, requirement_ids: [] })); setFront(''); setBack(''); }} className="rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white">Add flashcard</button>
      </div>
    </div>
  );
}

function Schedule({ kit, onRegen, busy }: { kit: Kit; onRegen: () => void; busy: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Schedule · {kit.schedule.days_available} days</h2>
        <button onClick={onRegen} disabled={busy} className={ghostBtn}>{busy ? 'Regenerating…' : 'Regenerate'}</button>
      </div>
      <div className="space-y-2">
        {kit.schedule.days.map((d) => (
          <div key={d.day} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
            <span><span className="mono text-violet-300">Day {d.day}</span> · {d.focus || 'Review'}</span>
            <span className="mono text-xs text-zinc-500">{d.question_ids.length} q · {d.minutes} min</span>
          </div>
        ))}
      </div>
    </div>
  );
}
