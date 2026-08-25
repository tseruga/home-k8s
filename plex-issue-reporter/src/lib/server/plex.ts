const PLEX_HEADERS = (clientId: string) => ({
  Accept: 'application/json',
  'X-Plex-Product': 'Plex Issue Reporter',
  'X-Plex-Client-Identifier': clientId
});

export type PlexPin = { id: number; code: string };
export type PlexUser = { id: number; username: string; email: string };

export async function createPin(clientId: string, fetchFn: typeof fetch = fetch): Promise<PlexPin> {
  const res = await fetchFn('https://plex.tv/api/v2/pins?strong=true', {
    method: 'POST',
    headers: PLEX_HEADERS(clientId)
  });
  if (!res.ok) throw new Error(`Plex createPin failed: ${res.status}`);
  const body = (await res.json()) as { id: number; code: string };
  return { id: body.id, code: body.code };
}

export function buildAuthUrl(clientId: string, code: string, forwardUrl: string): string {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    'context[device][product]': 'Plex Issue Reporter',
    forwardUrl
  });
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

export async function pollPin(pinId: number, clientId: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchFn(`https://plex.tv/api/v2/pins/${pinId}`, { headers: PLEX_HEADERS(clientId) });
  if (!res.ok) throw new Error(`Plex pollPin failed: ${res.status}`);
  const body = (await res.json()) as { authToken: string | null };
  return body.authToken ?? null;
}

export async function getUser(authToken: string, clientId: string, fetchFn: typeof fetch = fetch): Promise<PlexUser> {
  const res = await fetchFn('https://plex.tv/api/v2/user', {
    headers: { ...PLEX_HEADERS(clientId), 'X-Plex-Token': authToken }
  });
  if (!res.ok) throw new Error(`Plex getUser failed: ${res.status}`);
  const body = (await res.json()) as PlexUser;
  return { id: body.id, username: body.username, email: body.email };
}

// Plex retired /api/v2/friends — it now answers 410 Gone even unauthenticated.
// /api/users/ is the live replacement (it is what python-plexapi reads) and
// covers both friends and home users, which is the right set for a whitelist.
// Unlike the v2 endpoints it ignores Accept and always answers XML, so the ids
// are pulled straight out of the markup rather than through an XML dependency.
export async function listAllowedUserIds(ownerToken: string, clientId: string, fetchFn: typeof fetch = fetch): Promise<Set<number>> {
  const res = await fetchFn('https://plex.tv/api/users/', {
    headers: { ...PLEX_HEADERS(clientId), Accept: 'application/xml', 'X-Plex-Token': ownerToken }
  });
  if (!res.ok) throw new Error(`Plex listAllowedUserIds failed: ${res.status}`);
  const xml = await res.text();
  const ids = new Set<number>();
  // Match the <User ...> open tags only: each one nests a <Server id="..."> that
  // must not be mistaken for an account id.
  for (const [tag] of xml.matchAll(/<User\s[^>]*>/g)) {
    const id = /\sid="(\d+)"/.exec(tag);
    if (id) ids.add(Number(id[1]));
  }
  return ids;
}

export function isWhitelisted(userId: number, allowed: Set<number>, ownerId?: number): boolean {
  return allowed.has(userId) || userId === ownerId;
}
