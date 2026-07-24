import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadConfig } from '$lib/server/config';
import { pollPin, getUser, listAllowedUserIds, isWhitelisted } from '$lib/server/plex';
import { signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '$lib/server/session';

export const GET: RequestHandler = async ({ cookies }) => {
  const cfg = loadConfig();
  const pinId = Number(cookies.get('pir_pin'));
  if (!pinId) throw redirect(302, '/login');

  const authToken = await pollPin(pinId, cfg.plexClientId);
  if (!authToken) throw redirect(302, '/login');

  const user = await getUser(authToken, cfg.plexClientId);
  const [allowed, owner] = await Promise.all([
    listAllowedUserIds(cfg.plexOwnerToken, cfg.plexClientId),
    getUser(cfg.plexOwnerToken, cfg.plexClientId)
  ]);
  if (!isWhitelisted(user.id, allowed, owner.id)) throw redirect(302, '/denied');

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = signSession({ plexUserId: user.id, username: user.username, exp }, cfg.sessionSecret);
  cookies.set(SESSION_COOKIE, token, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: SESSION_TTL_SECONDS });
  cookies.delete('pir_pin', { path: '/' });
  throw redirect(302, '/');
};
