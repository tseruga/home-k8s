import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getClients, reportEpisodeIssue, reportSeasonIssue } from '$lib/server/media';

export const load: PageServerLoad = async ({ params }) => {
  const seriesId = Number(params.id);
  const { sonarr } = getClients();
  const series = (await sonarr.listSeries()).find((s) => s.id === seriesId);
  if (!series) throw error(404, 'Show not found');
  const episodes = await sonarr.listEpisodes(seriesId);
  const bySeason = new Map<number, Array<{ id: number; episodeNumber: number; title: string }>>();
  for (const e of episodes) {
    if (!bySeason.has(e.seasonNumber)) bySeason.set(e.seasonNumber, []);
    bySeason.get(e.seasonNumber)!.push({ id: e.id, episodeNumber: e.episodeNumber, title: e.title });
  }
  const seasons = [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seasonNumber, eps]) => ({ seasonNumber, episodes: eps.sort((a, b) => a.episodeNumber - b.episodeNumber) }));
  return { series: { id: series.id, title: series.title }, seasons };
};

export const actions: Actions = {
  reportEpisode: async ({ request, params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Not signed in' });
    const data = await request.formData();
    try {
      const message = await reportEpisodeIssue(
        Number(params.id),
        Number(data.get('episodeId')),
        locals.user.username,
        String(data.get('note') ?? '')
      );
      return { success: true, message };
    } catch (err) {
      console.error('[report episode]', err);
      return fail(502, { error: "Couldn't reach the media service. Try again later." });
    }
  },
  reportSeason: async ({ request, params, locals }) => {
    if (!locals.user) return fail(401, { error: 'Not signed in' });
    const data = await request.formData();
    try {
      const message = await reportSeasonIssue(
        Number(params.id),
        Number(data.get('seasonNumber')),
        locals.user.username,
        String(data.get('note') ?? '')
      );
      return { success: true, message };
    } catch (err) {
      console.error('[report season]', err);
      return fail(502, { error: "Couldn't reach the media service. Try again later." });
    }
  }
};
