'use client';

import { motion } from 'motion/react';

/** Per-character spring reveal (Motion; Bedrock motion-first SplitText). */
export function SplitText({ text, className = '', delay = 0.028 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={{ opacity: 0, y: '0.5em' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * delay, type: 'spring', stiffness: 220, damping: 24 }}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}
