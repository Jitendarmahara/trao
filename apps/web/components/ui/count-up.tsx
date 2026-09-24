'use client';

import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useSpring } from 'motion/react';

/** Spring count-up (adapted from Bedrock/ReactBits CountUp). */
export function CountUp({ to, duration = 1.6, className = '' }: { to: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const value = useMotionValue(0);
  const spring = useSpring(value, { damping: 20 + 40 / duration, stiffness: 100 / duration });
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) value.set(to);
  }, [inView, to, value]);
  useEffect(() => spring.on('change', (v) => {
    if (ref.current) ref.current.textContent = String(Math.round(v));
  }), [spring]);

  return <span ref={ref} className={className}>0</span>;
}
