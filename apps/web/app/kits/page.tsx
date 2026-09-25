'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { api, ApiError, type Job, type KitSummary } from '@/lib/api';
import { CountUp } from '@/components/ui/count-up';

const STAGES = ['extracting', 'crawling', 'interview-research', 'generating', 'covering', 'scheduling', 'validating', 'done'];
const STAGE_LABEL: Record<string, string> = {
  extracting: 'Reading the job description',
  crawling: 'Studying the company',
  'interview-research': 'Researching how they interview',
  generating: 'Writing your questions',
  covering: 'Checking every requirement is covered',
  scheduling: 'Building your study plan',
  validating: 'Final checks',
  done: 'Done',
};
const EASE = [0.22, 1, 0.36, 1] as const;

export default function KitsPage() {
  const router = useRouter();
  const [kits, setKits] = useState<KitSummary[] | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jd, setJd] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [days, setDays] = useState(7);

  async function refresh() {
    try {
      const { kits } = await api.listKits();
      setKits(kits);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) router.push('/login');
      else setError('Could not load your kits. Refresh to try again.');
    }
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'failed') return;
    const t = setInterval(async () => {
      try {
        const { job: updated } = await api.getJob(job.id);
        setJob(updated);
        if (updated.status === 'done') {
          void refresh();
          if (updated.kitId) router.push(`/kits/${updated.kitId}`);
        }
      } catch { /* keep polling */ }
    }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);

  async function createKit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.createKit({ jd, companyUrl, companyName: companyName || undefined, days });
      const jobId = res.jobId ?? res.job?.id;
      if (jobId) setJob((await api.getJob(jobId)).job);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start generation. Check your inputs and try again.');
    }
  }

  const totalQuestions = (kits ?? []).reduce((n, k) => n + k.questionCount, 0);
  const companies = new Set((kits ?? []).map((k) => k.company)).size;
  const stage = job?.stage ?? job?.status ?? '';
  const stageIndex = STAGES.indexOf(stage);
  const generating = job && job.status !== 'done' && job.status !== 'failed';

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <header className="mb-12 flex items-center justify-between">
        <Link href="/kits" className="flex items-center gap-2.5">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-navy text-[13px] font-semibold text-white">ip</span>
          <span className="font-display text-[15px] text-ink">Interview Prep Kit</span>
        </Link>
        <button onClick={async () => { await api.logout(); router.push('/login'); }} className="btn-text">
          Sign out
        </button>
      </header>

      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl tracking-tightest text-ink">Your prep kits</h1>
        {kits && kits.length > 0 && (
          <dl className="flex items-stretch divide-x divide-line rounded-xl border border-line bg-surface">
            <Figure label="Kits" value={kits.length} />
            <Figure label="Questions" value={totalQuestions} />
            <Figure label="Companies" value={companies} />
          </dl>
        )}
      </div>

      {/* Compose — the primary action, and the loudest surface on the page */}
      <section className="panel-key mb-10 p-6 sm:p-7">
        <h2 className="font-display text-xl tracking-tight text-ink">Start a new kit</h2>
        <p className="mb-5 mt-1 text-sm text-ink-soft">
          Paste the posting and tell us where to research. Generation takes about a minute.
        </p>
        <form onSubmit={createKit} className="space-y-3.5">
          <textarea
            required
            placeholder="Paste the full job description here…"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            className="field min-h-[7rem] resize-y leading-relaxed"
          />
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1.4fr_1fr_auto]">
            <input required type="url" placeholder="Company website (https://…)" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} className="field" />
            <input placeholder="Company name (optional)" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="field" />
            <label className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-3.5 text-sm text-ink-soft transition focus-within:border-navy focus-within:shadow-[0_0_0_3px_theme(colors.navy.tint)] hover:border-line-strong">
              <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days until interview" className="w-12 bg-transparent py-2.5 text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
              <span className="whitespace-nowrap">days to prep</span>
            </label>
          </div>
          <button type="submit" disabled={!!generating} className="btn-primary">
            {generating ? 'Generating…' : 'Generate kit'}
          </button>
        </form>
      </section>

      <AnimatePresence>
        {job && job.status !== 'done' && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-8 overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-card"
            role="status" aria-live="polite"
          >
            {job.status === 'failed' ? (
              <p className="text-sm text-clay">Generation failed: {job.error?.message ?? 'something went wrong.'} You can start again above.</p>
            ) : (
              <>
                <div className="mb-2.5 flex items-center justify-between gap-4 text-sm">
                  <span className="flex items-center gap-2.5 text-ink">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brass opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-brass" />
                    </span>
                    {STAGE_LABEL[stage] ?? 'Working…'}
                  </span>
                  <span className="text-ink-faint">{Math.max(stageIndex, 0) + 1} of {STAGES.length}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-navy-tint">
                  <motion.div
                    className="h-full rounded-full bg-navy"
                    animate={{ width: `${((stageIndex + 1) / STAGES.length) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="mb-6 text-sm text-clay">{error}</p>}

      {kits === null ? (
        <p className="text-sm text-ink-soft">Loading your kits…</p>
      ) : kits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="font-display text-lg text-ink">No kits yet.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">Your first kit is one job description away — fill in the form above and we&rsquo;ll do the research.</p>
        </div>
      ) : (
        <section>
          <h2 className="mb-1 font-medium text-ink-soft">Recent</h2>
          <ul className="divide-y divide-line border-y border-line">
            {kits.map((k, i) => (
              <motion.li
                key={k.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.4, ease: EASE }}
              >
                <Link href={`/kits/${k.id}`} className="group flex items-center gap-4 py-4 transition">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink transition group-hover:text-navy">{k.role || 'Untitled role'}</p>
                    <p className="truncate text-sm text-ink-soft">{k.company || 'Unknown company'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-5 text-sm text-ink-faint">
                    <span><span className="font-medium text-ink-soft">{k.questionCount}</span> questions</span>
                    <span className="hidden sm:inline"><span className="font-medium text-ink-soft">{k.days}</span> days</span>
                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-navy" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-5 py-3">
      <dd className="font-display text-2xl leading-none tracking-tight text-ink"><CountUp to={value} /></dd>
      <dt className="mt-1 text-xs text-ink-faint">{label}</dt>
    </div>
  );
}
