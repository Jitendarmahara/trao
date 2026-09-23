/** What public discussion tells us about a company's interview process. */
export interface InterviewResearch {
  /** False when nothing usable was found — never fabricate a process. */
  found: boolean;
  /** Short honest summary, or a "no info" line when found is false. */
  summary: string;
  /** Ordered stage names we can support from the text (may be empty). */
  rounds: string[];
  hasTakeHome: boolean;
  hasSystemDesign: boolean;
  behaviouralEmphasis: boolean;
  /** URLs the findings came from. */
  sources: string[];
}

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
}

/** Pluggable web-search backend, so the provider stays swappable and free. */
export interface SearchProvider {
  search(query: string, limit?: number): Promise<SearchResult[]>;
}
