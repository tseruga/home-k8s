import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const full = {
  RADARR_URL: 'http://r', RADARR_API_KEY: 'rk',
  SONARR_URL: 'http://s', SONARR_API_KEY: 'sk',
  PLEX_OWNER_TOKEN: 'ot', PLEX_CLIENT_ID: 'cid',
  PUBLIC_APP_URL: 'http://localhost:5173', DISCORD_WEBHOOK_URL: 'http://d', SESSION_SECRET: 'secret'
};

describe('loadConfig', () => {
  it('maps env vars to a typed config', () => {
    const c = loadConfig(full);
    expect(c.radarrUrl).toBe('http://r');
    expect(c.sessionSecret).toBe('secret');
  });

  it('throws listing all missing required vars', () => {
    expect(() => loadConfig({ ...full, RADARR_API_KEY: undefined, SESSION_SECRET: undefined }))
      .toThrowError(/RADARR_API_KEY.*SESSION_SECRET|SESSION_SECRET.*RADARR_API_KEY/s);
  });
});
