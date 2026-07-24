import { redirect, type Handle } from '@sveltejs/kit';
import { loadConfig } from '$lib/server/config';
import { SESSION_COOKIE, verifySession } from '$lib/server/session';

const PUBLIC_PREFIXES = ['/login', '/auth', '/denied', '/healthz'];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

export const handle: Handle = async ({ event, resolve }) => {
  const cfg = loadConfig();
  const token = event.cookies.get(SESSION_COOKIE);
  event.locals.user = token ? verifySession(token, cfg.sessionSecret) : null;

  if (!event.locals.user && !isPublicPath(event.url.pathname)) {
    throw redirect(302, '/login');
  }
  return resolve(event);
};
