import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  throw redirect(302, '/login');
};
