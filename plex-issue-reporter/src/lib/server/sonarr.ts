import { decideAction, type RemediationAction } from './remediation';

export type SonarrSeries = {
  id: number;
  title: string;
  monitored: boolean;
  seasons: Array<{ seasonNumber: number; monitored: boolean }>;
};

export type SonarrEpisode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  monitored: boolean;
  hasFile: boolean;
  episodeFileId?: number;
};

type HistoryRecord = { id: number; eventType: string };

export function createSonarrClient(cfg: { baseUrl: string; apiKey: string; fetchFn?: typeof fetch }) {
  const fetchFn = cfg.fetchFn ?? fetch;
  const base = cfg.baseUrl.replace(/\/$/, '');
  const headers = { 'X-Api-Key': cfg.apiKey, 'content-type': 'application/json' };

  async function req(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetchFn(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`Sonarr ${path} failed: ${res.status}`);
    return res;
  }

  async function listSeries(): Promise<SonarrSeries[]> {
    const all = (await (await req('/api/v3/series')).json()) as SonarrSeries[];
    return all.filter((s) => s.monitored);
  }

  async function listEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
    return (await (await req(`/api/v3/episode?seriesId=${seriesId}`)).json()) as SonarrEpisode[];
  }

  async function searchEpisodes(episodeIds: number[]): Promise<void> {
    await req('/api/v3/command', { method: 'POST', body: JSON.stringify({ name: 'EpisodeSearch', episodeIds }) });
  }

  async function remediateEpisode(ep: SonarrEpisode): Promise<RemediationAction> {
    const action = decideAction(ep);
    if (action === 'search') {
      await searchEpisodes([ep.id]);
      return action;
    }
    const body = (await (await req(`/api/v3/history?episodeId=${ep.id}`)).json()) as
      | HistoryRecord[]
      | { records: HistoryRecord[] };
    const history = Array.isArray(body) ? body : (body.records ?? []);
    const grabbed = history.find((h) => h.eventType === 'grabbed');
    // Blocklist the release we grabbed this episode from (if any) so it isn't picked
    // again, then DELETE the file so Sonarr sees the episode as missing. Without the
    // delete, the existing file still meets the quality-profile cutoff and every
    // replacement is rejected as "not an upgrade" — at both grab and import time — so
    // nothing is ever re-downloaded. Finally, search for a new copy.
    if (grabbed) {
      await req(`/api/v3/history/failed/${grabbed.id}`, { method: 'POST' });
    }
    if (ep.episodeFileId) await req(`/api/v3/episodefile/${ep.episodeFileId}`, { method: 'DELETE' });
    await searchEpisodes([ep.id]);
    return action;
  }

  async function remediateSeason(seriesId: number, seasonNumber: number): Promise<{ perEpisode: RemediationAction[] }> {
    const episodes = (await listEpisodes(seriesId)).filter((e) => e.seasonNumber === seasonNumber && e.monitored);
    const perEpisode: RemediationAction[] = [];
    for (const ep of episodes) perEpisode.push(await remediateEpisode(ep));
    await req('/api/v3/command', { method: 'POST', body: JSON.stringify({ name: 'SeasonSearch', seriesId, seasonNumber }) });
    return { perEpisode };
  }

  return { listSeries, listEpisodes, remediateEpisode, remediateSeason };
}
