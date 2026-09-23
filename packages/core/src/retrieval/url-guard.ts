export interface UrlGuardOptions {
  /**
   * Allow loopback / private / localhost targets. Kept FALSE in production to
   * prevent SSRF, but set TRUE for the Section 9 batch, whose company sites may
   * be served from a local address.
   */
  allowLocal?: boolean;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** True if a hostname points at loopback / private / link-local space. */
export function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '::') return true;

  // IPv4 literal → check private/loopback/link-local ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127) return true; // this-network / loopback
    if (a === 10) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 169 && b === 254) return true; // link-local
    return false;
  }

  // Any other IPv6 literal → block conservatively in production.
  if (h.includes(':')) return true;

  return false;
}

/**
 * Validate an external URL before fetching it. Rejects non-http(s) protocols and,
 * unless `allowLocal`, private/loopback hosts. This is the SSRF gate for §11.
 */
export function checkUrl(raw: string, options: UrlGuardOptions = {}): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: `invalid URL: ${raw}` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `unsupported protocol: ${url.protocol}` };
  }
  if (!options.allowLocal && isPrivateOrLocalHost(url.hostname)) {
    return { ok: false, reason: `blocked private/loopback host: ${url.hostname}` };
  }
  return { ok: true, url };
}
