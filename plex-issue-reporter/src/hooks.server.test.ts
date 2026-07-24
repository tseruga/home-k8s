import { describe, it, expect } from 'vitest';
import { isPublicPath } from './hooks.server';

describe('isPublicPath', () => {
  it('allows auth, login, denied, health', () => {
    for (const p of ['/login', '/auth/plex', '/auth/callback', '/denied', '/healthz']) {
      expect(isPublicPath(p)).toBe(true);
    }
  });
  it('guards everything else', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/shows/5')).toBe(false);
  });
});
