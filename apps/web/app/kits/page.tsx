'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, type Job, type KitSummary } from '@/lib/api';

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

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the generation job until it finishes.
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
      } catch {
        /* keep polling */
      }
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
      if (jobId) {
        const { job } = await api.getJob(jobId);
        setJob(job);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start generation.');
    }
  }

  async function logout() {
    await api.logout();
    router.push('/login');
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your prep kits</h1>
        <button onClick={logout} className="text-sm text-slate-600 underline">
          Sign out
        </button>
      </div>

      <form onSubmit={createKit} className="mb-8 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Create a kit</h2>
        <textarea
          required
          placeholder="Paste the job description…"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          className="h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input required placeholder="Company website URL" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Company name (optional)" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" aria-label="Days until interview" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Generate kit
        </button>
      </form>

      {job && job.status !== 'done' && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm" role="status" aria-live="polite">
          {job.status === 'failed' ? (
            <span className="text-red-700">Generation failed: {job.error?.message}</span>
          ) : (
            <span>Generating… <span className="font-mono">{job.stage ?? job.status}</span></span>
          )}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {kits === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : kits.length === 0 ? (
        <p className="text-sm text-slate-500">No kits yet. Create your first one above.</p>
      ) : (
        <ul className="space-y-2">
          {kits.map((k) => (
            <li key={k.id}>
              <Link href={`/kits/${k.id}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400">
                <span>
                  <span className="font-semibold">{k.role || 'Role'}</span>
                  <span className="text-slate-500"> · {k.company || 'Company'}</span>
                </span>
                <span className="text-xs text-slate-400">{k.questionCount} questions · {k.days} days</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
