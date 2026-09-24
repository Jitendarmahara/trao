'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Kit, Question } from '@interview-prep-kit/core';
import { api, ApiError, type KitResponse, type QuestionCategory } from '@/lib/api';
import { PracticeMode } from '@/components/PracticeMode';

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
  return <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{label}</span>;
}

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
        const stored = await api.getKit(id);
        setKit(stored.kit);
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

  if (error && !kit) return <Shell><p className="text-red-600">{error}</p></Shell>;
  if (!kit) return <Shell><p className="text-slate-500">Loading…</p></Shell>;

  const questionsIn = (cat: QuestionCategory) =>
    kit.questions.filter((q) => q.category === cat).sort((a, b) => meta(a).order - meta(b).order);

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link href="/kits" className="text-sm text-slate-500 underline">← All kits</Link>
          <h1 className="text-2xl font-bold">{kit.role.title || 'Role'} · {kit.source.company || 'Company'}</h1>
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm capitalize ${tab === t ? 'border-b-2 border-slate-900 font-semibold' : 'text-slate-500'}`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview kit={kit} run={run} />}
      {tab === 'questions' && (
        <div className="space-y-8">
          {CATEGORIES.map((cat) => {
            const qs = questionsIn(cat);
            return (
              <section key={cat}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-semibold capitalize">{cat.replace('-', ' ')} <span className="text-slate-400">({qs.length})</span></h2>
                  <button
                    onClick={() => run(`regen-${cat}`, () => api.regenerate(id, cat))}
                    disabled={busy !== null}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                  >
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
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>;
}

function Overview({ kit, run }: { kit: Kit; run: (l: string, fn: () => Promise<KitResponse>) => void }) {
  const id = String(useParams().id);
  const [summary, setSummary] = useState(kit.company_brief.summary);
  const [what, setWhat] = useState(kit.company_brief.what_they_do);
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Company brief <StateBadge item={kit.company_brief as unknown as Record<string, unknown>} /></h2>
          <button onClick={() => run('regen-brief', () => api.regenerate(id, 'company_brief'))} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">Regenerate</button>
        </div>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="mb-2 w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} />
        <textarea value={what} onChange={(e) => setWhat(e.target.value)} className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} />
        <button onClick={() => run('save-brief', () => api.editBrief(id, { summary, what_they_do: what }))} className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Save brief</button>
        {kit.company_brief.sources.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">Sources: {kit.company_brief.sources.join(', ')}</p>
        )}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Requirements</h2>
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-400"><th>ID</th><th>Priority</th><th>Kind</th><th>Requirement</th></tr></thead>
          <tbody>
            {kit.role.requirements.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-1 pr-2 font-mono text-xs">{r.id}</td>
                <td className="pr-2">{r.priority}</td>
                <td className="pr-2">{r.kind}</td>
                <td>{r.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function QuestionRow({
  kitId, q, canUp, canDown, onReorderSwap, onChanged,
}: {
  kitId: string;
  q: Question;
  canUp: boolean;
  canDown: boolean;
  onReorderSwap: (dir: 'up' | 'down') => void;
  onChanged: (res: KitResponse) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [answer, setAnswer] = useState(q.answer_outline);
  const m = meta(q as unknown as Record<string, unknown>);
  const pinned = m.state === 'pinned';
  async function save() {
    onChanged(await api.editQuestion(kitId, q.id, { prompt, answer_outline: answer }));
    setEditing(false);
  }
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      {editing ? (
        <>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mb-2 w-full rounded border border-slate-300 p-2" rows={2} />
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="mb-2 w-full rounded border border-slate-300 p-2 text-slate-600" rows={3} />
          <button onClick={save} className="mr-2 rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-500">Cancel</button>
        </>
      ) : (
        <>
          <p className="font-medium">
            {q.prompt}
            <StateBadge item={q as unknown as Record<string, unknown>} />
            <span className="ml-2 text-[10px] text-slate-400">d{q.difficulty} · {q.requirement_ids.join(',') || '—'}</span>
          </p>
          <p className="mt-1 whitespace-pre-wrap text-slate-500">{q.answer_outline}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button onClick={() => setEditing(true)} className="text-slate-600 underline">Edit</button>
            <button onClick={async () => onChanged(await api.pinQuestion(kitId, q.id, !pinned))} className="text-slate-600 underline">{pinned ? 'Unpin' : 'Pin'}</button>
            <button onClick={async () => onChanged(await api.deleteQuestion(kitId, q.id))} className="text-red-600 underline">Delete</button>
            <button disabled={!canUp} onClick={() => onReorderSwap('up')} className="disabled:opacity-30">↑</button>
            <button disabled={!canDown} onClick={() => onReorderSwap('down')} className="disabled:opacity-30">↓</button>
            <select
              value={q.category}
              onChange={async (e) => onChanged(await api.moveQuestion(kitId, q.id, e.target.value as QuestionCategory))}
              className="rounded border border-slate-300 px-1 text-xs"
              aria-label="Move to category"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </>
      )}
    </li>
  );
}

function AddQuestion({ kitId, category, onAdded }: { kitId: string; category: QuestionCategory; onAdded: (res: KitResponse) => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  if (!open) return <button onClick={() => setOpen(true)} className="mt-2 text-xs text-slate-500 underline">+ Add question</button>;
  return (
    <div className="mt-2 rounded border border-dashed border-slate-300 p-2">
      <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Your question…" className="mb-2 w-full rounded border border-slate-300 p-2 text-sm" />
      <button
        onClick={async () => {
          onAdded(await api.addQuestion(kitId, { category, requirement_ids: [], prompt, answer_outline: '', difficulty: 2 }));
          setPrompt('');
          setOpen(false);
        }}
        className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
      >
        Add
      </button>
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
        <button onClick={() => run('regen-flashcards', () => api.regenerate(kitId, 'flashcards'))} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100">Regenerate</button>
      </div>
      <ul className="space-y-2">
        {kit.flashcards.map((f) => (
          <li key={f.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="font-medium">{f.front}<StateBadge item={f as unknown as Record<string, unknown>} /></p>
            <p className="mt-1 text-slate-500">{f.back}</p>
            <button onClick={async () => onChanged(await api.deleteFlashcard(kitId, f.id))} className="mt-1 text-xs text-red-600 underline">Delete</button>
          </li>
        ))}
      </ul>
      <div className="rounded border border-dashed border-slate-300 p-2">
        <input value={front} onChange={(e) => setFront(e.target.value)} placeholder="Front" className="mb-2 w-full rounded border border-slate-300 p-2 text-sm" />
        <input value={back} onChange={(e) => setBack(e.target.value)} placeholder="Back" className="mb-2 w-full rounded border border-slate-300 p-2 text-sm" />
        <button
          onClick={async () => { onChanged(await api.addFlashcard(kitId, { front, back, requirement_ids: [] })); setFront(''); setBack(''); }}
          className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
        >
          Add flashcard
        </button>
      </div>
    </div>
  );
}

function Schedule({ kit, onRegen, busy }: { kit: Kit; onRegen: () => void; busy: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Schedule · {kit.schedule.days_available} days</h2>
        <button onClick={onRegen} disabled={busy} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50">{busy ? 'Regenerating…' : 'Regenerate'}</button>
      </div>
      <table className="w-full text-left text-sm">
        <thead><tr className="text-slate-400"><th>Day</th><th>Focus</th><th>Questions</th><th>Minutes</th></tr></thead>
        <tbody>
          {kit.schedule.days.map((d) => (
            <tr key={d.day} className="border-t border-slate-100">
              <td className="py-1 pr-2">{d.day}</td>
              <td className="pr-2">{d.focus}</td>
              <td className="pr-2">{d.question_ids.length}</td>
              <td>{d.minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
