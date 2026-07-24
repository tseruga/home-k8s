import { describe, it, expect } from 'vitest';
import { signSession, verifySession, SESSION_TTL_SECONDS } from './session';

const secret = 'test-secret';
const user = { plexUserId: 42, username: 'ada', exp: 2_000_000_000 };

describe('session', () => {
  it('round-trips a signed session', () => {
    const token = signSession(user, secret);
    expect(verifySession(token, secret, 1_000_000_000)).toEqual(user);
  });

  it('rejects a tampered payload', () => {
    const token = signSession(user, secret);
    const [payload, sig] = token.split('.');
    const forged = payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A') + '.' + sig;
    expect(verifySession(forged, secret, 1_000_000_000)).toBeNull();
  });

  it('rejects the wrong secret', () => {
    const token = signSession(user, secret);
    expect(verifySession(token, 'other', 1_000_000_000)).toBeNull();
  });

  it('rejects an expired session', () => {
    const token = signSession(user, secret);
    expect(verifySession(token, secret, user.exp + 1)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySession('garbage', secret, 1)).toBeNull();
  });

  it('exports a 7-day TTL', () => {
    expect(SESSION_TTL_SECONDS).toBe(604800);
  });
});
