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

/** Safe, secret-free observability for the interview-research stage. */
export interface InterviewResearchDiagnostics {
  queries_attempted: string[];
  /** Every URL the search returned. */
  returned_urls: string[];
  search_results_returned: number;
  /** URLs that fetched successfully (any content). */
  fetched_urls: string[];
  /** Fetched URLs that passed the company-specific interview-evidence gate. */
  evidence_sources: string[];
  usable_search_results: number;
  rejected_sources: { url: string; reason: string }[];
  signals_detected: { hasTakeHome: boolean; hasSystemDesign: boolean; behaviouralEmphasis: boolean };
  final_found: boolean;
  /** Non-null when the search backend was blocked/unavailable (vs. genuinely empty). */
  search_error: string | null;
}

/** Pluggable web-search backend, so the provider stays swappable and free. */
export interface SearchProvider {
  search(query: string, limit?: number): Promise<SearchResult[]>;
}
