import { describe, expect, it } from 'vitest';
import {
  parsePreference,
  readDevForce,
  readStoredPreference,
  resolveTheme,
  writeStoredPreference,
} from './theme.js';
import { APPEARANCE_ENABLED, THEME_STORAGE_KEY } from './config.js';

describe('Appearance ships hidden', () => {
  it('is disabled by config', () => {
    expect(APPEARANCE_ENABLED).toBe(false);
  });
});

describe('resolveTheme', () => {
  const base = { systemDark: true, appearanceEnabled: false } as const;

  it('is Light regardless of the OS scheme or a stored preference while disabled', () => {
    for (const preference of ['system', 'light', 'dark'] as const) {
      expect(resolveTheme({ ...base, preference })).toBe('light');
    }
  });

  it('honours the preference once enabled; System follows the OS', () => {
    const on = { ...base, appearanceEnabled: true };
    expect(resolveTheme({ ...on, preference: 'dark', systemDark: false })).toBe('dark');
    expect(resolveTheme({ ...on, preference: 'light', systemDark: true })).toBe('light');
    expect(resolveTheme({ ...on, preference: 'system', systemDark: true })).toBe('dark');
    expect(resolveTheme({ ...on, preference: 'system', systemDark: false })).toBe('light');
  });

  it('lets the dev switch win over everything', () => {
    expect(resolveTheme({ ...base, preference: 'light', devForce: 'dark' })).toBe('dark');
    expect(
      resolveTheme({ ...base, appearanceEnabled: true, preference: 'dark', devForce: 'light' }),
    ).toBe('light');
  });
});

describe('readDevForce', () => {
  it('reads ?theme= only when the switch is enabled', () => {
    expect(readDevForce('?theme=dark', true)).toBe('dark');
    expect(readDevForce('?x=1&theme=light', true)).toBe('light');
    expect(readDevForce('?theme=dark', false)).toBeNull();
  });

  it('ignores missing or invalid values', () => {
    expect(readDevForce('', true)).toBeNull();
    expect(readDevForce('?theme=system', true)).toBeNull();
    expect(readDevForce('?theme=purple', true)).toBeNull();
  });
});

describe('stored preference', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it('defaults to system and round-trips', () => {
    const s = memory();
    expect(readStoredPreference(s)).toBe('system');
    writeStoredPreference(s, 'dark');
    expect(s.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredPreference(s)).toBe('dark');
  });

  it('falls back to system for garbage, a throwing store, or no store', () => {
    const s = memory();
    s.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readStoredPreference(s)).toBe('system');
    expect(
      readStoredPreference({
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {},
      }),
    ).toBe('system');
    expect(readStoredPreference(null)).toBe('system');
    expect(() => writeStoredPreference(null, 'dark')).not.toThrow();
  });

  it('parsePreference rejects unknown values', () => {
    expect(parsePreference('light')).toBe('light');
    expect(parsePreference('auto')).toBeNull();
    expect(parsePreference(undefined)).toBeNull();
  });
});
