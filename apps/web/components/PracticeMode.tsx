'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Flashcard } from '@interview-prep-kit/core';

function load(key: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function save(key: string, value: Record<string, number>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / blocked storage — practice still works this session */
  }
}

// A confidence scale kept inside the palette: clay → brass → pine.
const RATINGS: { value: number; label: string; dot: string }[] = [
  { value: 1, label: 'No idea', dot: '#B04A38' },
  { value: 2, label: 'Shaky', dot: '#C0703A' },
  { value: 3, label: 'Okay', dot: '#C7A034' },
  { value: 4, label: 'Good', dot: '#6E9A4E' },
  { value: 5, label: 'Nailed it', dot: '#2C6E5B' },
];

/**
 * Step through flashcards one at a time, reveal the answer, record confidence, and
 * order the session least-confident first (confidence-weighted spaced practice).
 */
export function PracticeMode({ kitId, flashcards }: { kitId: string; flashcards: Flashcard[] }) {
  const storageKey = `ipk_practice_${kitId}`;
  const [confidence, setConfidence] = useState<Record<string, number>>(() => load(storageKey));
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // Least-confident (and not-yet-rated) cards first.
  const ordered = useMemo(
    () => [...flashcards].sort((a, b) => (confidence[a.id] ?? -1) - (confidence[b.id] ?? -1)),
    [flashcards, confidence],
  );
  const rated = flashcards.filter((f) => confidence[f.id] !== undefined);
  const covered = rated.length;
  const total = flashcards.length;
  const avg = rated.length ? rated.reduce((s, f) => s + confidence[f.id], 0) / rated.length : 0;

  const card = ordered.length ? ordered[idx % ordered.length] : undefined;

  const rate = useCallback(
    (value: number) => {
      if (!card) return;
      const next = { ...confidence, [card.id]: value };
      setConfidence(next);
      save(storageKey, next);
      setRevealed(false);
      setIdx((i) => i + 1);
    },
    [card, confidence, storageKey],
  );

  const skip = useCallback(() => {
    setRevealed(false);
    setIdx((i) => i + 1);
  }, []);

  // Keyboard: space/enter reveals, 1–5 rate, → skips.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        rate(Number(e.key));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skip();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, rate, skip]);

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center">
        <p className="font-display text-lg text-ink">Nothing to practise yet.</p>
        <p className="mt-1.5 text-sm text-ink-soft">Generate or add some flashcards first, then come back to drill them.</p>
      </div>
    );
  }

  const progressPct = total ? (covered / total) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* Progress */}
      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-ink-soft">
            <span className="font-medium text-ink">{covered}</span> of {total} rated
            <span className="ml-3 text-ink-faint">least-confident first</span>
          </span>
          {covered > 0 && (
            <span className="text-xs text-ink-faint">
              avg confidence <span className="font-medium text-brass">{avg.toFixed(1)}</span>
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-navy-tint">
          <motion.div
            className="h-full rounded-full bg-navy"
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          />
        </div>
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={card?.id ?? 'none'}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="panel-key p-7 sm:p-8"
        >
          <div className="flex items-center justify-between">
            <span className="kicker text-navy">Question</span>
            {card && confidence[card.id] !== undefined && (
              <span className="text-[11px] text-ink-faint">
                last time: {RATINGS.find((r) => r.value === confidence[card.id])?.label}
              </span>
            )}
          </div>

          <p className="mt-3 font-display text-2xl leading-snug tracking-tight text-ink">{card?.front}</p>

          <AnimatePresence initial={false}>
            {revealed ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="my-5 h-px bg-line" />
                <span className="kicker text-pine">Answer</span>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-soft">{card?.back}</p>

                <p className="mt-7 text-sm text-ink-soft">How well did you know it?</p>
                <div className="mt-2.5 grid grid-cols-5 gap-2">
                  {RATINGS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => rate(r.value)}
                      className="group flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-3 text-xs text-ink-soft outline-none transition hover:border-line-strong hover:bg-white"
                      aria-label={`Confidence ${r.value} — ${r.label}`}
                    >
                      <span className="h-2.5 w-2.5 rounded-full transition-transform group-hover:scale-125" style={{ background: r.dot }} />
                      <span className="font-semibold text-ink">{r.value}</span>
                      <span className="hidden text-[10px] text-ink-faint sm:block">{r.label}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-ink-faint">
                  Press <span className="kbd">1</span>–<span className="kbd">5</span> to rate, <span className="kbd">→</span> to skip.
                </p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-7 flex items-center gap-3">
                <button onClick={() => setRevealed(true)} className="btn-primary">Reveal answer</button>
                <button onClick={skip} className="btn-text">Skip</button>
                <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-ink-faint sm:flex">
                  <span className="kbd">space</span> to reveal
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      {covered === total && total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2.5 rounded-xl border border-pine/25 bg-pine/5 p-4 text-sm text-pine"
        >
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          You&rsquo;ve rated every card. Keep going — the weakest ones keep resurfacing first.
        </motion.div>
      )}
    </div>
  );
}
