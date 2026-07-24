import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadConfig } from '$lib/server/config';
import { createPin, buildAuthUrl } from '$lib/server/plex';

export const GET: RequestHandler = async ({ cookies }) => {
  const cfg = loadConfig();
  const pin = await createPin(cfg.plexClientId);
  cookies.set('pir_pin', String(pin.id), { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
  throw redirect(302, buildAuthUrl(cfg.plexClientId, pin.code, `${cfg.publicAppUrl}/auth/callback`));
};
