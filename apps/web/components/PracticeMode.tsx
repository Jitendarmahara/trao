'use client';

import { useMemo, useState } from 'react';
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
  const covered = flashcards.filter((f) => confidence[f.id] !== undefined).length;

  if (flashcards.length === 0) return <p className="text-sm text-slate-500">No flashcards to practise yet.</p>;

  const card = ordered[idx % ordered.length];
  function rate(value: number) {
    const next = { ...confidence, [card.id]: value };
    setConfidence(next);
    save(storageKey, next);
    setRevealed(false);
    setIdx((i) => i + 1);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Covered {covered}/{flashcards.length} · showing least-confident first
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-400">Front</p>
        <p className="mt-1 text-lg font-medium">{card.front}</p>
        {revealed ? (
          <>
            <p className="mt-4 text-xs uppercase tracking-wide text-slate-400">Answer</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{card.back}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => rate(v)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                  aria-label={`Confidence ${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">1 = shaky · 5 = confident</p>
          </>
        ) : (
          <button onClick={() => setRevealed(true)} className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Reveal answer
          </button>
        )}
      </div>
    </div>
  );
}
