import { describe, it, expect, vi } from 'vitest';
import { createSonarrClient } from './sonarr';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const missingEp = { id: 10, seasonNumber: 2, episodeNumber: 2, title: 'B', monitored: true, hasFile: false };
const badEp = { id: 11, seasonNumber: 2, episodeNumber: 1, title: 'A', monitored: true, hasFile: true, episodeFileId: 77 };

describe('sonarr client', () => {
  it('lists only monitored series', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json([
      { id: 1, title: 'Severance', monitored: true, seasons: [{ seasonNumber: 2, monitored: true }] },
      { id: 2, title: 'Dead', monitored: false, seasons: [] }
    ]));
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect((await c.listSeries()).map((s) => s.id)).toEqual([1]);
  });

  it('searches a missing episode', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({}));
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await c.remediateEpisode(missingEp)).toBe('search');
    const call = fetchFn.mock.calls.find(([u]) => u === 'http://s/api/v3/command')!;
    expect(JSON.parse(call[1].body)).toEqual({ name: 'EpisodeSearch', episodeIds: [10] });
  });

  it('marks a bad episode grabbed-history failed', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('http://s/api/v3/history')) return json([{ id: 800, eventType: 'grabbed' }]);
      return json({});
    });
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await c.remediateEpisode(badEp)).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/history/failed/800' && i.method === 'POST')).toBe(true);
  });

  it('remediates a whole season then fires SeasonSearch', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('http://s/api/v3/episode?seriesId')) return json([missingEp, badEp]);
      if (url.startsWith('http://s/api/v3/history')) return json([{ id: 801, eventType: 'grabbed' }]);
      return json({});
    });
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const result = await c.remediateSeason(1, 2);
    expect(result.perEpisode).toContain('search');
    expect(result.perEpisode).toContain('blocklist-and-regrab');
    const seasonCall = fetchFn.mock.calls.find(([u, i]) => u === 'http://s/api/v3/command' && JSON.parse(i.body).name === 'SeasonSearch')!;
    expect(JSON.parse(seasonCall[1].body)).toEqual({ name: 'SeasonSearch', seriesId: 1, seasonNumber: 2 });
  });
});
