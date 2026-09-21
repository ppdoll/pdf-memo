import { describe, expect, it } from 'vitest';
import { resolveLww } from '../lww';

describe('resolveLww', () => {
  it('later updatedAt wins regardless of device', () => {
    expect(
      resolveLww(
        { updatedAt: '2026-09-21T10:00:00.000Z', deviceId: 'z' },
        { updatedAt: '2026-09-21T10:00:01.000Z', deviceId: 'a' },
      ),
    ).toBe('remote');
    expect(
      resolveLww(
        { updatedAt: '2026-09-21T10:00:02.000Z', deviceId: 'z' },
        { updatedAt: '2026-09-21T10:00:01.000Z', deviceId: 'a' },
      ),
    ).toBe('local');
  });

  it('same instant: higher rev wins', () => {
    const t = '2026-09-21T10:00:00.000Z';
    expect(
      resolveLww({ updatedAt: t, deviceId: 'a', rev: 3 }, { updatedAt: t, deviceId: 'a', rev: 5 }),
    ).toBe('remote');
  });

  it('same instant and rev: lexicographically smaller deviceId wins deterministically', () => {
    const t = '2026-09-21T10:00:00.000Z';
    expect(resolveLww({ updatedAt: t, deviceId: 'a' }, { updatedAt: t, deviceId: 'b' })).toBe(
      'local',
    );
    expect(resolveLww({ updatedAt: t, deviceId: 'b' }, { updatedAt: t, deviceId: 'a' })).toBe(
      'remote',
    );
  });

  it('identical stamps keep local', () => {
    const s = { updatedAt: '2026-09-21T10:00:00.000Z', deviceId: 'a', rev: 1 };
    expect(resolveLww(s, { ...s })).toBe('local');
  });
});
