import { describe, it, expect, vi } from 'vitest';
import { createPin, buildAuthUrl, pollPin, getUser, listAllowedUserIds, isWhitelisted } from './plex';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('plex auth', () => {
  it('creates a pin', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: 1, code: 'ABCD' }));
    const pin = await createPin('cid', fetchFn as unknown as typeof fetch);
    expect(pin).toEqual({ id: 1, code: 'ABCD' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('plex.tv/api/v2/pins');
    expect(init.headers['X-Plex-Client-Identifier']).toBe('cid');
  });

  it('builds the auth url with forwardUrl and code', () => {
    const url = buildAuthUrl('cid', 'ABCD', 'http://localhost:5173/auth/callback');
    expect(url).toContain('app.plex.tv/auth');
    expect(url).toContain('code=ABCD');
    expect(url).toContain(encodeURIComponent('http://localhost:5173/auth/callback'));
  });

  it('returns authToken when pin is authorized', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: 1, authToken: 'tok' }));
    expect(await pollPin(1, 'cid', fetchFn as unknown as typeof fetch)).toBe('tok');
  });

  it('returns null when pin not yet authorized', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: 1, authToken: null }));
    expect(await pollPin(1, 'cid', fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it('reads the authenticated user', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ id: 42, username: 'ada', email: 'a@b.c' }));
    expect(await getUser('tok', 'cid', fetchFn as unknown as typeof fetch)).toEqual({ id: 42, username: 'ada', email: 'a@b.c' });
  });
});

describe('plex whitelist', () => {
  it('collects shared user ids', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([{ id: 7 }, { id: 8 }]));
    const ids = await listAllowedUserIds('ot', 'cid', fetchFn as unknown as typeof fetch);
    expect(ids.has(7)).toBe(true);
    expect(ids.has(8)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(init.headers['X-Plex-Client-Identifier']).toBe('cid');
  });

  it('allows shared users and the owner, rejects others', () => {
    const allowed = new Set([7, 8]);
    expect(isWhitelisted(7, allowed)).toBe(true);
    expect(isWhitelisted(99, allowed, 99)).toBe(true);
    expect(isWhitelisted(100, allowed, 99)).toBe(false);
  });
});
