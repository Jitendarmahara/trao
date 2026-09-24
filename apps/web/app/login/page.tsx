'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { api, ApiError } from '@/lib/api';
import { Aurora } from '@/components/ui/aurora';
import { SplitText } from '@/components/ui/split-text';
import { Magnet } from '@/components/ui/magnet';

const SPRING = { type: 'spring' as const, stiffness: 200, damping: 25 };

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await api.register(email, password);
      else await api.login(email, password);
      router.push('/kits');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <Aurora />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#09090b] via-transparent to-[#09090b]/70" />

      <div className="grid w-full max-w-5xl items-center gap-12 md:grid-cols-2">
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, ...SPRING }}
            className="mono mb-6 text-xs uppercase tracking-[0.2em] text-violet-400"
          >
            Your unfair interview advantage
          </motion.p>
          <h1 className="text-5xl font-semibold leading-[0.95] tracking-tighter sm:text-6xl">
            <SplitText text="Walk in" />
            <br />
            <span className="serif font-normal text-violet-400">
              <SplitText text="already prepared." delay={0.03} />
            </span>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, ...SPRING }}
            className="mt-6 max-w-md text-lg leading-relaxed text-zinc-400"
          >
            Paste a job description, point us at the company, and get a researched
            prep kit — questions, flashcards, and a day-by-day plan.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, ...SPRING }}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur"
        >
          <h2 className="mb-1 text-xl font-semibold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mb-6 text-sm text-zinc-500">{mode === 'login' ? 'Sign in to your kits.' : 'Start in seconds.'}</p>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" type="email" value={email} onChange={setEmail} />
            <Field label="Password" type="password" value={password} onChange={setPassword} minLength={8} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Magnet>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </Magnet>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="mt-5 text-sm text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200"
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
          </button>
        </motion.div>
      </div>
    </main>
  );
}

function Field({
  label, type, value, onChange, minLength,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-300">
      {label}
      <input
        type={type}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-violet-500"
      />
    </label>
  );
}
