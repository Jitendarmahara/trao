import type { Fetcher } from './fetcher.js';

export interface RobotsRules {
  isAllowed(path: string): boolean;
}

interface Rule {
  allow: boolean;
  path: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

/**
 * Minimal robots.txt parser: groups rules by user-agent, prefers an exact
 * user-agent match over `*`, and decides a path by the longest matching rule
 * (an Allow can override a broader Disallow). Sufficient and honest for §2.
 */
export function parseRobots(txt: string, userAgent = '*'): RobotsRules {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasRule = false;

  for (const line of txt.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, '').trim();
    if (!clean) continue;
    const idx = clean.indexOf(':');
    if (idx === -1) continue;
    const field = clean.slice(0, idx).trim().toLowerCase();
    const value = clean.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || lastWasRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasRule = false;
    } else if (field === 'disallow' || field === 'allow') {
      if (!current) {
        current = { agents: ['*'], rules: [] };
        groups.push(current);
      }
      current.rules.push({ allow: field === 'allow', path: value });
      lastWasRule = true;
    }
  }

  const ua = userAgent.toLowerCase();
  let rules = groups.filter((g) => g.agents.includes(ua)).flatMap((g) => g.rules);
  if (rules.length === 0) {
    rules = groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  }

  return {
    isAllowed(path: string): boolean {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (rule.path === '') continue; // empty Disallow means "allow all"
        if (path.startsWith(rule.path)) {
          if (!best || rule.path.length > best.path.length) best = rule;
        }
      }
      return best ? best.allow : true;
    },
  };
}

/**
 * Fetch and parse a site's robots.txt. On any failure, default to allow-all —
 * and report the HTTP status so the caller can record a *real* retrieval error
 * (a plain 404 just means "no robots file", which is not worth recording).
 */
export async function fetchRobots(
  base: URL,
  fetcher: Fetcher,
): Promise<{ rules: RobotsRules; status: number }> {
  const robotsUrl = new URL('/robots.txt', base).toString();
  const res = await fetcher.fetch(robotsUrl);
  if (res.ok && typeof res.body === 'string') {
    return { rules: parseRobots(res.body), status: res.status };
  }
  return { rules: parseRobots(''), status: res.status };
}
