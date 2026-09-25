'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig, motion } from 'motion/react';
import { api, ApiError } from '@/lib/api';

const EASE = [0.22, 1, 0.36, 1] as const;

// What the kit actually contains — the dossier's contents page, in real terms.
const CONTENTS = [
  ['Company brief', 'What they do and how they hire, read from their own site.'],
  ['Question bank', 'Technical, behavioural and system-design, sorted by what the role demands.'],
  ['Flashcards', 'Drill the essentials with confidence-weighted repetition.'],
  ['Study plan', 'Every day up to the interview mapped out, hardest material first.'],
];

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
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-screen px-6 md:px-12 lg:px-20">
        <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-x-16 gap-y-12 py-16 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Masthead — one orchestrated reveal on load */}
          <motion.div
            initial="hidden"
            animate="show"
            transition={{ staggerChildren: 0.08, delayChildren: 0.05 }}
            className="max-w-xl"
          >
            <motion.div
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.5, ease: EASE }}
              className="flex items-center gap-2.5"
            >
              <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-navy text-[13px] font-semibold text-white">
                ip
              </span>
              <span className="font-display text-[15px] text-ink">Interview Prep Kit</span>
            </motion.div>

            <motion.h1
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mt-9 font-display text-5xl leading-[1.02] tracking-tightest text-ink sm:text-[3.75rem]"
            >
              Walk into the room already prepared.
            </motion.h1>

            <motion.p
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mt-7 max-w-md text-[17px] leading-relaxed text-ink-soft"
            >
              Paste a job description and point us at the company. You get back a researched
              prep kit built for that role — and the days you have left to study it.
            </motion.p>

            <motion.dl
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mt-11 border-t border-line"
            >
              {CONTENTS.map(([title, desc]) => (
                <div key={title} className="grid grid-cols-[9.5rem_1fr] gap-4 border-b border-line py-3.5">
                  <dt className="font-medium text-ink">{title}</dt>
                  <dd className="text-sm leading-relaxed text-ink-soft">{desc}</dd>
                </div>
              ))}
            </motion.dl>
          </motion.div>

          {/* Sign-in — the key surface */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6, ease: EASE }}
            className="panel-key w-full p-7 sm:p-8"
          >
            <h2 className="font-display text-2xl tracking-tight text-ink">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mb-7 mt-1.5 text-sm text-ink-soft">
              {mode === 'login' ? 'Sign in to pick up where you left off.' : 'Set up in seconds — no card, no fuss.'}
            </p>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {error && (
                <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} className="btn-primary w-full py-3">
                {busy ? 'Just a moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>
            <div className="mt-6 border-t border-line pt-5 text-sm text-ink-soft">
              {mode === 'login' ? "Don't have an account yet? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => { setError(null); setMode(mode === 'login' ? 'register' : 'login'); }}
                className="font-medium text-navy underline-offset-4 transition hover:underline"
              >
                {mode === 'login' ? 'Create one' : 'Sign in'}
              </button>
            </div>
          </motion.div>
        </div>
      </main>
    </MotionConfig>
  );
}

function Field({
  label, type, value, onChange, minLength, autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        type={type}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
    </label>
  );
}
