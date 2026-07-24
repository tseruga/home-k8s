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

  it('blocklists, deletes the file, and searches a bad episode with a grabbed record', async () => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith('http://s/api/v3/history')) return json([{ id: 800, eventType: 'grabbed' }]);
      return json({});
    });
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await c.remediateEpisode(badEp)).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/history/failed/800' && i.method === 'POST')).toBe(true);
    // delete the file so the episode is "missing", otherwise the replacement is rejected as not-an-upgrade
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/episodefile/77' && i.method === 'DELETE')).toBe(true);
    const searchCall = fetchFn.mock.calls.find(([u]) => u === 'http://s/api/v3/command')!;
    expect(JSON.parse(searchCall[1].body as string)).toEqual({ name: 'EpisodeSearch', episodeIds: [11] });
  });

  it('handles a paged history response, then blocklists + deletes + searches', async () => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith('http://s/api/v3/history')) {
        return json({ page: 1, totalRecords: 1, records: [{ id: 802, eventType: 'grabbed' }] });
      }
      return json({});
    });
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await c.remediateEpisode(badEp)).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/history/failed/802' && i.method === 'POST')).toBe(true);
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/episodefile/77' && i.method === 'DELETE')).toBe(true);
    const searchCall = fetchFn.mock.calls.find(([u]) => u === 'http://s/api/v3/command')!;
    expect(JSON.parse(searchCall[1].body as string)).toEqual({ name: 'EpisodeSearch', episodeIds: [11] });
  });

  it('falls back to delete file + search when no grabbed record exists', async () => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith('http://s/api/v3/history')) return json({ records: [] });
      return json({});
    });
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await c.remediateEpisode(badEp)).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/episodefile/77' && i.method === 'DELETE')).toBe(true);
    const searchCall = fetchFn.mock.calls.find(([u]) => u === 'http://s/api/v3/command')!;
    expect(JSON.parse(searchCall[1].body as string)).toEqual({ name: 'EpisodeSearch', episodeIds: [11] });
  });

  it('clears bad episodes and fires a single SeasonSearch (no per-episode searches)', async () => {
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith('http://s/api/v3/episode?seriesId')) return json([missingEp, badEp]);
      if (url.startsWith('http://s/api/v3/history')) return json([{ id: 801, eventType: 'grabbed' }]);
      return json({});
    });
    const c = createSonarrClient({ baseUrl: 'http://s', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const result = await c.remediateSeason(1, 2);
    expect(result.perEpisode).toContain('search');
    expect(result.perEpisode).toContain('blocklist-and-regrab');
    // the bad episode is still cleared: its release blocklisted and its file deleted
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/history/failed/801' && i.method === 'POST')).toBe(true);
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://s/api/v3/episodefile/77' && i.method === 'DELETE')).toBe(true);
    // searching is delegated to ONE SeasonSearch so Sonarr can grab a season pack
    const commandCalls = fetchFn.mock.calls.filter(([u]) => u === 'http://s/api/v3/command');
    const commandNames = commandCalls.map(([, i]) => JSON.parse(i.body as string).name);
    expect(commandNames).toEqual(['SeasonSearch']);
    const seasonCall = commandCalls[0];
    expect(JSON.parse(seasonCall[1].body as string)).toEqual({ name: 'SeasonSearch', seriesId: 1, seasonNumber: 2 });
  });
});
