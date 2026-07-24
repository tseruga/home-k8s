import { getClients } from './media';

export type CatalogMovie = { id: number; title: string; year: number };
export type CatalogSeries = { id: number; title: string };
export type Catalog = { movies: CatalogMovie[]; series: CatalogSeries[] };

export function createCatalogCache(opts: {
  fetchCatalog: () => Promise<Catalog>;
  now?: () => number;
  ttlMs?: number;
}): () => Promise<Catalog> {
  const now = opts.now ?? Date.now;
  const ttlMs = opts.ttlMs ?? 60_000;
  let cached: { value: Catalog; expires: number } | null = null;
  let inflight: Promise<Catalog> | null = null;

  return async function getCatalog(): Promise<Catalog> {
    if (cached && now() < cached.expires) return cached.value;
    if (inflight) return inflight;
    inflight = opts
      .fetchCatalog()
      .then((value) => {
        cached = { value, expires: now() + ttlMs };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}

async function fetchFromClients(): Promise<Catalog> {
  const { radarr, sonarr } = getClients();
  const [movies, series] = await Promise.all([radarr.listMovies(), sonarr.listSeries()]);
  return {
    movies: movies.map((m) => ({ id: m.id, title: m.title, year: m.year })),
    series: series.map((s) => ({ id: s.id, title: s.title }))
  };
}

export const getCatalog = createCatalogCache({ fetchCatalog: fetchFromClients });
