import { Fetcher } from './fetcher.js';
import { extractPage } from './html.js';
import { scoreLink } from './link-scorer.js';
import { fetchRobots, type RobotsRules } from './robots.js';
import { checkUrl } from './url-guard.js';
import type { CompanyResearch, CrawledPage, FetchFn, SkippedSource } from './types.js';

export interface CrawlOptions {
  fetchFn?: FetchFn;
  /** Allow localhost/private targets (Section 9 batch). Default false. */
  allowLocal?: boolean;
  /** Max page fetch attempts (bounds work / time). Default 8. */
  maxPages?: number;
  /** How many link-hops from the homepage to follow. Default 2. */
  maxDepth?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

interface Candidate {
  url: string;
  score: number;
  hiring: boolean;
  depth: number;
}

/** Same registrable site (naive: last two labels) — keeps us on the company domain. */
function sameSite(a: string, b: string): boolean {
  const reg = (host: string): string => {
    const parts = host.toLowerCase().split('.');
    return parts.length <= 2 ? host.toLowerCase() : parts.slice(-2).join('.');
  };
  return reg(a) === reg(b);
}

/**
 * Crawl a company site: fetch the homepage, rank its links, and follow the most
 * promising ones (best-first, budgeted) to find what the company does and how it
 * hires. Respects robots.txt, guards against SSRF, and records every skipped
 * source instead of failing the run.
 */
export async function crawlCompany(
  companyUrl: string,
  options: CrawlOptions = {},
): Promise<CompanyResearch> {
  const { allowLocal = false, maxPages = 8, maxDepth = 2 } = options;
  const fetcher = new Fetcher({
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
  });

  const skipped: SkippedSource[] = [];
  const pages: CrawledPage[] = [];
  const pagesUsed: string[] = [];

  const guard = checkUrl(companyUrl, { allowLocal });
  if (!guard.ok) {
    return {
      company_url: companyUrl,
      pages_used: [],
      skipped: [{ url: companyUrl, reason: guard.reason }],
      hiringPages: [],
      otherPages: [],
    };
  }
  const base = guard.url;
  const robots: RobotsRules = await fetchRobots(base, fetcher);

  const visited = new Set<string>();
  const frontier: Candidate[] = [
    { url: base.toString(), score: Number.POSITIVE_INFINITY, hiring: false, depth: 0 },
  ];
  let attempts = 0;

  while (frontier.length > 0 && attempts < maxPages) {
    // Best-first: take the highest-scoring candidate.
    frontier.sort((a, b) => b.score - a.score);
    const candidate = frontier.shift()!;
    if (visited.has(candidate.url)) continue;
    visited.add(candidate.url);

    let path = '/';
    try {
      path = new URL(candidate.url).pathname;
    } catch {
      /* keep default */
    }
    if (!robots.isAllowed(path)) {
      skipped.push({ url: candidate.url, reason: 'blocked by robots.txt' });
      continue;
    }

    attempts++;
    const res = await fetcher.fetch(candidate.url);
    if (!res.ok) {
      skipped.push({ url: candidate.url, reason: res.reason });
      continue;
    }

    const extracted = extractPage(candidate.url, res.body);
    pages.push({
      url: candidate.url,
      title: extracted.title,
      text: extracted.text,
      hiring: candidate.hiring,
    });
    pagesUsed.push(candidate.url);

    if (candidate.depth < maxDepth) {
      for (const link of extracted.links) {
        if (visited.has(link.url)) continue;
        if (!sameSite(new URL(candidate.url).hostname, new URL(link.url).hostname)) continue;
        const scored = scoreLink(link);
        if (scored.score <= 0) continue;
        frontier.push({
          url: link.url,
          score: scored.score,
          hiring: scored.hiring,
          depth: candidate.depth + 1,
        });
      }
    }
  }

  const homepage = pages.find((p) => p.url === base.toString());
  const rest = pages.filter((p) => p !== homepage);

  return {
    company_url: base.toString(),
    pages_used: pagesUsed,
    skipped,
    homepage,
    hiringPages: rest.filter((p) => p.hiring),
    otherPages: rest.filter((p) => !p.hiring),
  };
}
