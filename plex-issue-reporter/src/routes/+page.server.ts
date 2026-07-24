import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { reportMovieIssue } from '$lib/server/media';

export const actions: Actions = {
  report: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { error: 'Not signed in' });
    const data = await request.formData();
    const movieId = Number(data.get('movieId'));
    const note = String(data.get('note') ?? '');
    try {
      const message = await reportMovieIssue(movieId, locals.user.username, note);
      return { success: true, message };
    } catch (err) {
      console.error('[report movie]', err);
      return fail(502, { error: "Couldn't reach the media service. Try again later." });
    }
  }
};
