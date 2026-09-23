/** Injectable fetch so code needs no real network in tests. Matches global `fetch`. */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
