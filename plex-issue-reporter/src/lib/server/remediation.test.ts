import { describe, it, expect } from 'vitest';
import { decideAction, actionLabel } from './remediation';

describe('decideAction', () => {
  it('blocklists+regrabs when a file already exists', () => {
    expect(decideAction({ hasFile: true })).toBe('blocklist-and-regrab');
  });
  it('searches when the media is missing', () => {
    expect(decideAction({ hasFile: false })).toBe('search');
  });
});

describe('actionLabel', () => {
  it('describes each action', () => {
    expect(actionLabel('blocklist-and-regrab')).toMatch(/blocklist|re-?grab/i);
    expect(actionLabel('search')).toMatch(/search/i);
  });
});
