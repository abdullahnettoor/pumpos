// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectThemeFlags } from './prepaint.js';
import { THEME_STORAGE_KEY } from './config.js';
import { THEME_COLORS, resolveTheme, type ThemePreference } from './theme.js';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const rawScript = /<script>([\s\S]*?)<\/script>/.exec(html)![1];

/** In-memory Storage (Node's own experimental localStorage can shadow jsdom's). */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

function setSystemDark(dark: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: dark,
    media: q,
  })) as unknown as typeof window.matchMedia;
}

/** Runs the pre-paint script as the browser would, against a fresh <html>. */
function prepaint(flags: { devSwitch: boolean; appearanceEnabled: boolean }) {
  const code = injectThemeFlags(rawScript, flags);
  new Function(code)();
  return {
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    classes: document.documentElement.className,
    themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
  document.documentElement.className = 'light';
  document.head.innerHTML = '<meta name="theme-color" content="#f3f5f2" />';
  setSystemDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('index.html pre-paint theme script', () => {
  it('has placeholders that injectThemeFlags fills completely', () => {
    expect(rawScript).toContain('__THEME_DEV_SWITCH__');
    expect(rawScript).toContain('__APPEARANCE_ENABLED__');
    const filled = injectThemeFlags(rawScript, { devSwitch: false, appearanceEnabled: false });
    expect(filled).not.toMatch(/__[A-Z_]+__/);
  });

  it('declares Light (class + theme-color) in the static markup', () => {
    expect(html).toContain('<html lang="en" class="light">');
    expect(html).toContain('<meta name="theme-color" content="#f3f5f2" />');
  });

  it('as shipped: Light even if the OS is dark and dark is stored', () => {
    setSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const r = prepaint({ devSwitch: false, appearanceEnabled: false });
    expect(r).toEqual({ theme: 'light', classes: 'light', themeColor: THEME_COLORS.light });
  });

  it('as shipped: ?theme=dark is ignored without the dev switch', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    expect(prepaint({ devSwitch: false, appearanceEnabled: false }).theme).toBe('light');
  });

  it('dev switch: ?theme=dark forces Dark with the dark theme-color', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    const r = prepaint({ devSwitch: true, appearanceEnabled: false });
    expect(r).toEqual({ theme: 'dark', classes: 'dark', themeColor: THEME_COLORS.dark });
  });

  // Parity with resolveTheme: the script and the TS model must never disagree.
  const prefs: Array<ThemePreference | null> = [null, 'system', 'light', 'dark'];
  for (const stored of prefs) {
    for (const systemDark of [false, true]) {
      for (const query of ['', '?theme=dark', '?theme=light']) {
        for (const devSwitch of [false, true]) {
          for (const appearanceEnabled of [false, true]) {
            it(`matches resolveTheme (stored=${stored} osDark=${systemDark} q="${query}" dev=${devSwitch} appearance=${appearanceEnabled})`, () => {
              setSystemDark(systemDark);
              if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
              window.history.replaceState(null, '', `/${query}`);
              const devForce = devSwitch
                ? query === '?theme=dark'
                  ? 'dark'
                  : query === '?theme=light'
                    ? 'light'
                    : null
                : null;
              const expected = resolveTheme({
                preference: stored ?? 'system',
                systemDark,
                appearanceEnabled,
                devForce,
              });
              expect(prepaint({ devSwitch, appearanceEnabled }).theme).toBe(expected);
            });
          }
        }
      }
    }
  }
});
