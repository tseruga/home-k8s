import { describe, it, expect, vi } from 'vitest';
import { createPin, buildAuthUrl, pollPin, getUser, listAllowedUserIds, isWhitelisted } from './plex';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function xmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'application/xml' } });
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
  it('collects shared user ids from the XML user list', async () => {
    // plex.tv/api/users/ speaks XML only, and nests a <Server> element (with its
    // own id attribute) inside each <User> — only the User ids may be collected.
    const fetchFn = vi.fn().mockResolvedValue(
      xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer friendlyName="myPlex" identifier="com.plexapp.plugins.myplex" totalSize="2">
  <User id="7" title="ada" username="ada" email="a@b.c" recommendationsPlaylistId="999" home="0">
    <Server id="555" serverId="123" machineIdentifier="abc" name="home-server" />
  </User>
  <User id="8" title="grace" username="grace" email="g@b.c" home="1" restricted="0" />
</MediaContainer>`)
    );
    const ids = await listAllowedUserIds('ot', 'cid', fetchFn as unknown as typeof fetch);
    expect(ids).toEqual(new Set([7, 8]));
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://plex.tv/api/users/');
    expect(init.headers['X-Plex-Token']).toBe('ot');
    expect(init.headers['X-Plex-Client-Identifier']).toBe('cid');
  });

  it('throws when the user list request fails', async () => {
    const fetchFn = vi.fn().mockResolvedValue(xmlResponse('', 410));
    await expect(listAllowedUserIds('ot', 'cid', fetchFn as unknown as typeof fetch)).rejects.toThrow('410');
  });

  it('allows shared users and the owner, rejects others', () => {
    const allowed = new Set([7, 8]);
    expect(isWhitelisted(7, allowed)).toBe(true);
    expect(isWhitelisted(99, allowed, 99)).toBe(true);
    expect(isWhitelisted(100, allowed, 99)).toBe(false);
  });
});
