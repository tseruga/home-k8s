import { describe, it, expect, vi } from 'vitest';
import { makeMovieReporter } from './media';

describe('makeMovieReporter', () => {
  it('remediates then notifies discord and returns the label', async () => {
    const radarr = {
      listMovies: vi.fn().mockResolvedValue([{ id: 1, title: 'Dune', year: 2021, monitored: true, hasFile: true, movieFileId: 5, tmdbId: 1 }]),
      remediate: vi.fn().mockResolvedValue('blocklist-and-regrab')
    };
    const notify = vi.fn().mockResolvedValue(undefined);
    const report = makeMovieReporter(radarr as never, 'http://webhook', notify);
    const label = await report(1, 'ada', 'bad audio');
    expect(radarr.remediate).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('http://webhook', expect.objectContaining({
      username: 'ada', mediaLabel: 'Dune (2021)', note: 'bad audio', action: 'blocklist-and-regrab'
    }));
    expect(label).toMatch(/blocklist|re-?grab/i);
  });

  it('throws when the movie id is unknown', async () => {
    const radarr = { listMovies: vi.fn().mockResolvedValue([]), remediate: vi.fn() };
    const report = makeMovieReporter(radarr as never, 'http://webhook', vi.fn());
    await expect(report(999, 'ada', '')).rejects.toThrow(/not found/i);
  });
});
