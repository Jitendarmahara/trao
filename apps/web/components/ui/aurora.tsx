'use client';

import { motion } from 'motion/react';

/**
 * Ambient aurora background. Bedrock's Aurora is WebGL/OGL; this is a lightweight
 * CSS-blob version (no heavy 3D dep, SSR-safe) per Bedrock's "one ambient
 * background, restraint" principle.
 */
export function Aurora({ className = '' }: { className?: string }) {
  const blobs = [
    { c: '#7c3aed55', cls: '-top-1/3 left-1/4', d: 18, x: [0, 60, -40, 0], y: [0, -30, 40, 0] },
    { c: '#4c1d9566', cls: 'top-1/4 right-1/5', d: 22, x: [0, -50, 30, 0], y: [0, 40, -20, 0] },
    { c: '#a78bfa44', cls: 'bottom-0 left-1/3', d: 26, x: [0, 40, -60, 0], y: [0, -50, 10, 0] },
  ];
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute h-[55vh] w-[55vh] rounded-full blur-3xl ${b.cls}`}
          style={{ background: `radial-gradient(circle, ${b.c}, transparent 60%)` }}
          animate={{ x: b.x, y: b.y }}
          transition={{ duration: b.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
