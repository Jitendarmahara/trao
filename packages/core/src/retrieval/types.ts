export type { FetchFn } from '../shared/http.js';

export interface PageLink {
  /** Absolute, resolved URL. */
  url: string;
  /** Anchor text. */
  text: string;
}

export interface ScoredLink extends PageLink {
  score: number;
  reasons: string[];
  /** True when the signals point at hiring/careers/interview content. */
  hiring: boolean;
}

export interface CrawledPage {
  url: string;
  title?: string;
  /** Cleaned, whitespace-collapsed page text (capped). */
  text: string;
  /** True when this page was reached by a hiring-signal link. */
  hiring: boolean;
}

/** A source we could not use — recorded, never fatal (the brief requires this). */
export interface SkippedSource {
  url: string;
  reason: string;
}

/** The result of crawling a company site — consumed by generation (Step 5). */
export interface CompanyResearch {
  company_url: string;
  /** Every URL we successfully fetched (goes into kit.source.pages_used). */
  pages_used: string[];
  /** Sources skipped with the reason (unreachable, robots-blocked, wrong type…). */
  skipped: SkippedSource[];
  homepage?: CrawledPage;
  /** Pages that look like hiring/careers/interview content, best first. */
  hiringPages: CrawledPage[];
  /** Other useful pages (about, product, blog…). */
  otherPages: CrawledPage[];
}
