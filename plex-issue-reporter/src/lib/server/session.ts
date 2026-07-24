import { createHmac, timingSafeEqual } from 'node:crypto';

export type SessionUser = { plexUserId: number; username: string; exp: number };

export const SESSION_COOKIE = 'pir_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signSession(user: SessionUser, secret: string): string {
  const payload = b64url(JSON.stringify(user));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(
  token: string,
  secret: string,
  now: number = Math.floor(Date.now() / 1000)
): SessionUser | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionUser;
    if (typeof user.exp !== 'number' || user.exp <= now) return null;
    return user;
  } catch {
    return null;
  }
}
