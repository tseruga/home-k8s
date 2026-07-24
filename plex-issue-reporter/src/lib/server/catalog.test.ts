import { describe, it, expect, vi } from 'vitest';
import { createCatalogCache, type Catalog } from './catalog';

const sample: Catalog = {
  movies: [{ id: 1, title: 'Dune', year: 2021 }],
  series: [{ id: 2, title: 'Severance' }]
};

describe('createCatalogCache', () => {
  it('returns the catalog from the fetcher', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue(sample);
    const getCatalog = createCatalogCache({ fetchCatalog, now: () => 0 });
    expect(await getCatalog()).toEqual(sample);
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('serves from cache within the TTL without refetching', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue(sample);
    let t = 0;
    const getCatalog = createCatalogCache({ fetchCatalog, now: () => t, ttlMs: 1000 });
    await getCatalog();
    t = 999;
    await getCatalog();
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL expires', async () => {
    const fetchCatalog = vi.fn().mockResolvedValue(sample);
    let t = 0;
    const getCatalog = createCatalogCache({ fetchCatalog, now: () => t, ttlMs: 1000 });
    await getCatalog();
    t = 1001;
    await getCatalog();
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });

  it('shares a single in-flight fetch across concurrent calls', async () => {
    let resolve!: (c: Catalog) => void;
    const fetchCatalog = vi.fn().mockReturnValue(new Promise<Catalog>((r) => (resolve = r)));
    const getCatalog = createCatalogCache({ fetchCatalog, now: () => 0 });
    const a = getCatalog();
    const b = getCatalog();
    resolve(sample);
    expect(await a).toEqual(sample);
    expect(await b).toEqual(sample);
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });
});
