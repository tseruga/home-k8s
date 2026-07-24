import { decideAction, type RemediationAction } from './remediation';

export type RadarrMovie = {
  id: number;
  title: string;
  year: number;
  monitored: boolean;
  hasFile: boolean;
  movieFileId?: number;
  tmdbId: number;
};

type HistoryRecord = { id: number; eventType: string };

export function createRadarrClient(cfg: { baseUrl: string; apiKey: string; fetchFn?: typeof fetch }) {
  const fetchFn = cfg.fetchFn ?? fetch;
  const base = cfg.baseUrl.replace(/\/$/, '');
  const headers = { 'X-Api-Key': cfg.apiKey, 'content-type': 'application/json' };

  async function req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetchFn(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`Radarr ${path} failed: ${res.status}`);
    return res;
  }

  async function listMovies(): Promise<RadarrMovie[]> {
    const all = (await (await req('/api/v3/movie')).json()) as RadarrMovie[];
    return all.filter((m) => m.monitored);
  }

  async function searchMovie(movieId: number): Promise<void> {
    await req('/api/v3/command', { method: 'POST', body: JSON.stringify({ name: 'MoviesSearch', movieIds: [movieId] }) });
  }

  async function remediate(movie: RadarrMovie): Promise<RemediationAction> {
    const action = decideAction(movie);
    if (action === 'search') {
      await searchMovie(movie.id);
      return action;
    }
    // The file exists but is bad. Blocklist the release it came from (if we grabbed
    // it) so it isn't picked again, then DELETE the file so Radarr sees the movie as
    // missing. Without the delete, the existing file still meets the quality-profile
    // cutoff and every replacement is rejected as "not an upgrade" — at both grab and
    // import time — so nothing is ever re-downloaded. Finally, search for a new copy.
    const history = (await (await req(`/api/v3/history/movie?movieId=${movie.id}`)).json()) as HistoryRecord[];
    const grabbed = history.find((h) => h.eventType === 'grabbed');
    if (grabbed) {
      await req(`/api/v3/history/failed/${grabbed.id}`, { method: 'POST' });
    }
    if (movie.movieFileId) await req(`/api/v3/moviefile/${movie.movieFileId}`, { method: 'DELETE' });
    await searchMovie(movie.id);
    return action;
  }

  return { listMovies, remediate };
}
