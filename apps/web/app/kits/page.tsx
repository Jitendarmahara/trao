'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { api, ApiError, type Job, type KitSummary } from '@/lib/api';
import { Aurora } from '@/components/ui/aurora';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { CountUp } from '@/components/ui/count-up';
import { Magnet } from '@/components/ui/magnet';

const STAGES = ['extracting', 'crawling', 'interview-research', 'generating', 'covering', 'scheduling', 'validating', 'done'];

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
      else setError('Could not load kits.');
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
      setError(err instanceof ApiError ? err.message : 'Could not start generation.');
    }
  }

  const totalQuestions = (kits ?? []).reduce((n, k) => n + k.questionCount, 0);
  const stageIndex = job ? STAGES.indexOf(job.stage ?? job.status) : -1;

  return (
    <main className="relative min-h-screen overflow-hidden px-6 py-10">
      <Aurora className="opacity-60" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#09090b]/50 via-[#09090b] to-[#09090b]" />

      <div className="mx-auto max-w-4xl">
        <header className="mb-10 flex items-end justify-between">
          <div>
            <p className="mono text-xs uppercase tracking-[0.2em] text-violet-400">Your workspace</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">Prep kits</h1>
          </div>
          <button onClick={async () => { await api.logout(); router.push('/login'); }} className="text-sm text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200">
            Sign out
          </button>
        </header>

        {kits && kits.length > 0 && (
          <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Kits" value={kits.length} />
            <Stat label="Questions" value={totalQuestions} />
            <Stat label="Companies" value={new Set(kits.map((k) => k.company)).size} />
          </div>
        )}

        <SpotlightCard className="mb-10 p-6">
          <h2 className="mb-4 text-lg font-semibold">Create a kit</h2>
          <form onSubmit={createKit} className="space-y-3">
            <textarea required placeholder="Paste the job description…" value={jd} onChange={(e) => setJd(e.target.value)} className="h-28 w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-violet-500" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input required placeholder="Company website URL" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-violet-500" />
              <input placeholder="Company name (optional)" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-violet-500" />
              <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days until interview" className="rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-violet-500" />
            </div>
            <Magnet>
              <button type="submit" className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500">
                Generate kit
              </button>
            </Magnet>
          </form>
        </SpotlightCard>

        <AnimatePresence>
          {job && job.status !== 'done' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mb-8 rounded-xl border border-violet-800/60 bg-violet-950/30 p-4"
              role="status" aria-live="polite"
            >
              {job.status === 'failed' ? (
                <span className="text-sm text-red-400">Generation failed: {job.error?.message}</span>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>Generating your kit…</span>
                    <span className="mono text-violet-300">{job.stage ?? job.status}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <motion.div className="h-full rounded-full bg-violet-500" animate={{ width: `${((stageIndex + 1) / STAGES.length) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {kits === null ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : kits.length === 0 ? (
          <p className="text-sm text-zinc-500">No kits yet — create your first one above.</p>
        ) : (
          <ul className="space-y-3">
            {kits.map((k, i) => (
              <motion.li key={k.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 200, damping: 24 }}>
                <Link href={`/kits/${k.id}`}>
                  <SpotlightCard className="flex items-center justify-between p-5 transition-transform hover:-translate-y-0.5">
                    <span>
                      <span className="font-semibold">{k.role || 'Role'}</span>
                      <span className="text-zinc-500"> · {k.company || 'Company'}</span>
                    </span>
                    <span className="mono text-xs text-zinc-500">{k.questionCount} q · {k.days} d</span>
                  </SpotlightCard>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <SpotlightCard className="p-5">
      <p className="mono text-xs uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-violet-300"><CountUp to={value} /></p>
    </SpotlightCard>
  );
}
