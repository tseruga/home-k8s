import { describe, it, expect, vi } from 'vitest';
import { buildEmbed, notifyDiscord } from './discord';

const report = { username: 'ada', mediaLabel: 'Dune (2021)', note: 'wrong audio', action: 'blocklist-and-regrab' as const };

describe('buildEmbed', () => {
  it('includes who, what, note and action', () => {
    const body = JSON.stringify(buildEmbed(report));
    expect(body).toContain('ada');
    expect(body).toContain('Dune (2021)');
    expect(body).toContain('wrong audio');
    expect(body).toMatch(/blocklist|re-?grab/i);
  });
});

describe('notifyDiscord', () => {
  it('POSTs the embed to the webhook', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await notifyDiscord('http://webhook', report, fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://webhook');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toHaveProperty('embeds');
  });

  it('never throws when the webhook fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(notifyDiscord('http://webhook', report, fetchFn as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});
