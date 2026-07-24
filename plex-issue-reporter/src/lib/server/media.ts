import { loadConfig } from './config';
import { createRadarrClient, type RadarrMovie } from './radarr';
import { createSonarrClient, type SonarrEpisode } from './sonarr';
import { notifyDiscord, type ReportSummary } from './discord';
import { actionLabel, type RemediationAction } from './remediation';

type RadarrLike = { listMovies: () => Promise<RadarrMovie[]>; remediate: (m: RadarrMovie) => Promise<RemediationAction> };
type NotifyFn = (url: string, r: ReportSummary) => Promise<void>;

export function makeMovieReporter(radarr: RadarrLike, webhookUrl: string, notify: NotifyFn = notifyDiscord) {
  return async function reportMovie(movieId: number, username: string, note: string): Promise<string> {
    const movie = (await radarr.listMovies()).find((m) => m.id === movieId);
    if (!movie) throw new Error(`Movie ${movieId} not found`);
    const action = await radarr.remediate(movie);
    await notify(webhookUrl, { username, mediaLabel: `${movie.title} (${movie.year})`, note, action });
    return actionLabel(action);
  };
}

export function getClients() {
  const cfg = loadConfig();
  return {
    cfg,
    radarr: createRadarrClient({ baseUrl: cfg.radarrUrl, apiKey: cfg.radarrApiKey }),
    sonarr: createSonarrClient({ baseUrl: cfg.sonarrUrl, apiKey: cfg.sonarrApiKey })
  };
}

export async function reportMovieIssue(movieId: number, username: string, note: string): Promise<string> {
  const { cfg, radarr } = getClients();
  return makeMovieReporter(radarr, cfg.discordWebhookUrl)(movieId, username, note);
}

export async function reportEpisodeIssue(seriesId: number, episodeId: number, username: string, note: string): Promise<string> {
  const { cfg, sonarr } = getClients();
  const episodes = await sonarr.listEpisodes(seriesId);
  const ep = episodes.find((e: SonarrEpisode) => e.id === episodeId);
  if (!ep) throw new Error(`Episode ${episodeId} not found`);
  const series = (await sonarr.listSeries()).find((s) => s.id === seriesId);
  const action = await sonarr.remediateEpisode(ep);
  await notifyDiscord(cfg.discordWebhookUrl, {
    username,
    mediaLabel: `${series?.title ?? 'Show'} · S${ep.seasonNumber}E${ep.episodeNumber}`,
    note,
    action
  });
  return actionLabel(action);
}

export async function reportSeasonIssue(seriesId: number, seasonNumber: number, username: string, note: string): Promise<string> {
  const { cfg, sonarr } = getClients();
  const series = (await sonarr.listSeries()).find((s) => s.id === seriesId);
  const { perEpisode } = await sonarr.remediateSeason(seriesId, seasonNumber);
  const anyRegrab = perEpisode.includes('blocklist-and-regrab');
  const action: RemediationAction = anyRegrab ? 'blocklist-and-regrab' : 'search';
  await notifyDiscord(cfg.discordWebhookUrl, {
    username,
    mediaLabel: `${series?.title ?? 'Show'} · S${seasonNumber} (full season)`,
    note,
    action
  });
  return actionLabel(action);
}
