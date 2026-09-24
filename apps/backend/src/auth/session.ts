import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'ipk_session';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SessionPayload {
  userId: string;
  exp: number; // epoch ms
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}
function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Stateless, HMAC-signed session token (`<payload>.<sig>`) — no server-side
 * session store, matching the stateless-server design. Not encrypted, so it
 * carries only the user id + expiry, never secrets.
 */
export function createSessionToken(userId: string, secret: string, ttlMs = DEFAULT_TTL_MS): string {
  const payload: SessionPayload = { userId, exp: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/** Verify a session token; returns the userId or null (bad signature / expired). */
export function verifySessionToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null; // expired
    return payload.userId;
  } catch {
    return null;
  }
}
