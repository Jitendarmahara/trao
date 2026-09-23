import type { PageLink, ScoredLink } from './types.js';

/**
 * Signals that a link leads to HIRING / careers / interview content. This is how
 * we find the hiring page by RANKING rather than guessing fixed paths like
 * `/careers` (the brief: "A fixed list of paths is not sufficient").
 */
const HIRING_SIGNALS: { kw: string; weight: number }[] = [
  { kw: 'interview', weight: 6 },
  { kw: 'hiring', weight: 6 },
  { kw: 'careers', weight: 5 },
  { kw: 'career', weight: 5 },
  { kw: 'jobs', weight: 5 },
  { kw: 'recruit', weight: 4 },
  { kw: 'join', weight: 4 },
  { kw: 'hire', weight: 4 },
  { kw: 'handbook', weight: 4 },
  { kw: 'work-with-us', weight: 4 },
  { kw: 'work with us', weight: 4 },
  { kw: 'life-at', weight: 3 },
  { kw: 'life at', weight: 3 },
  { kw: 'job', weight: 3 },
];

/** Signals that a link leads to useful CONTEXT (what the company does). */
const CONTEXT_SIGNALS: { kw: string; weight: number }[] = [
  { kw: 'about', weight: 3 },
  { kw: 'company', weight: 2 },
  { kw: 'team', weight: 2 },
  { kw: 'people', weight: 2 },
  { kw: 'culture', weight: 2 },
  { kw: 'engineering', weight: 2 },
  { kw: 'mission', weight: 1 },
  { kw: 'blog', weight: 1 },
];

/** Score one link by how promising it is, and whether it is a hiring signal. */
export function scoreLink(link: PageLink): ScoredLink {
  let path = '';
  try {
    path = new URL(link.url).pathname;
  } catch {
    path = link.url;
  }
  const haystack = `${path} ${link.text}`.toLowerCase();

  let score = 0;
  let hiring = false;
  const reasons: string[] = [];

  for (const { kw, weight } of HIRING_SIGNALS) {
    if (haystack.includes(kw)) {
      score += weight;
      hiring = true;
      reasons.push(`hiring:${kw}`);
    }
  }
  for (const { kw, weight } of CONTEXT_SIGNALS) {
    if (haystack.includes(kw)) {
      score += weight;
      reasons.push(`context:${kw}`);
    }
  }

  return { ...link, score, reasons, hiring };
}
