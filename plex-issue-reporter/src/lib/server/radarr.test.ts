import { describe, it, expect, vi } from 'vitest';
import { createRadarrClient } from './radarr';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const missing = { id: 1, title: 'Sinners', year: 2025, monitored: true, hasFile: false, tmdbId: 100 };
const bad = { id: 2, title: 'Dune', year: 2021, monitored: true, hasFile: true, movieFileId: 55, tmdbId: 200 };

describe('radarr client', () => {
  it('lists only monitored movies', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json([
      missing,
      { id: 3, title: 'Old', year: 1980, monitored: false, hasFile: true, tmdbId: 300 }
    ]));
    const client = createRadarrClient({ baseUrl: 'http://r', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const movies = await client.listMovies();
    expect(movies.map((m) => m.id)).toEqual([1]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://r/api/v3/movie');
    expect(init.headers['X-Api-Key']).toBe('k');
  });

  it('searches when the movie is missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({}));
    const client = createRadarrClient({ baseUrl: 'http://r', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const action = await client.remediate(missing);
    expect(action).toBe('search');
    const call = fetchFn.mock.calls.find(([u]) => u === 'http://r/api/v3/command')!;
    expect(JSON.parse(call[1].body)).toEqual({ name: 'MoviesSearch', movieIds: [1] });
  });

  it('marks the latest grabbed history failed when a file exists', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('http://r/api/v3/history/movie')) return json([{ id: 900, eventType: 'grabbed' }]);
      return json({});
    });
    const client = createRadarrClient({ baseUrl: 'http://r', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const action = await client.remediate(bad);
    expect(action).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://r/api/v3/history/failed/900' && i.method === 'POST')).toBe(true);
  });

  it('falls back to delete-file + search when a file exists but no grabbed history', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.startsWith('http://r/api/v3/history/movie')) return json([]);
      return json({});
    });
    const client = createRadarrClient({ baseUrl: 'http://r', apiKey: 'k', fetchFn: fetchFn as unknown as typeof fetch });
    const action = await client.remediate(bad);
    expect(action).toBe('blocklist-and-regrab');
    expect(fetchFn.mock.calls.some(([u, i]) => u === 'http://r/api/v3/moviefile/55' && i.method === 'DELETE')).toBe(true);
    expect(fetchFn.mock.calls.some(([u]) => u === 'http://r/api/v3/command')).toBe(true);
  });
});
