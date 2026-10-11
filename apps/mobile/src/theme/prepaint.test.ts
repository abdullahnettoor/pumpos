// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectThemeFlags } from './prepaint.js';
import { STATUS_BAR_STYLES, THEME_COLORS, THEME_STORAGE_KEY } from './config.js';
import { resolveTheme, applyTheme, type ThemePreference } from './theme.js';

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
    statusBar: document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
    )!.content,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
  document.documentElement.className = 'light';
  document.head.innerHTML =
    '<meta name="theme-color" content="" /><meta name="apple-mobile-web-app-status-bar-style" content="" />';
  setSystemDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('index.html pre-paint theme script', () => {
  it('has placeholders that injectThemeFlags fills completely', () => {
    expect(rawScript).toContain('__THEME_DEV_SWITCH__');
    expect(rawScript).toContain('__APPEARANCE_ENABLED__');
    for (const p of [
      '__THEME_STORAGE_KEY__',
      '__THEME_COLOR_LIGHT__',
      '__THEME_COLOR_DARK__',
      '__STATUS_BAR_LIGHT__',
      '__STATUS_BAR_DARK__',
    ]) {
      expect(rawScript, p).toContain(p);
    }
    const filled = injectThemeFlags(rawScript, { devSwitch: false, appearanceEnabled: false });
    expect(filled).not.toMatch(/__[A-Z_]+__/);
  });

  it('holds no second copy of the colours, storage key or status-bar styles', () => {
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(html).not.toContain(THEME_STORAGE_KEY);
    expect(html).not.toContain('black-translucent');
  });

  it('declares Light (class, theme-color, status bar) in the filled static markup', () => {
    const filled = injectThemeFlags(html, { devSwitch: false, appearanceEnabled: false });
    expect(filled).toContain('<html lang="en" class="light">');
    expect(filled).toContain(`<meta name="theme-color" content="${THEME_COLORS.light}" />`);
    expect(filled).toContain(
      `<meta name="apple-mobile-web-app-status-bar-style" content="${STATUS_BAR_STYLES.light}" />`,
    );
    expect(filled).not.toMatch(/__[A-Z_]+__/);
  });

  it('declares the status-bar meta before the script that updates it', () => {
    expect(html.indexOf('apple-mobile-web-app-status-bar-style')).toBeLessThan(
      html.indexOf('<script>'),
    );
  });

  it('as shipped: Light even if the OS is dark and dark is stored', () => {
    setSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const r = prepaint({ devSwitch: false, appearanceEnabled: false });
    expect(r).toEqual({
      theme: 'light',
      classes: 'light',
      themeColor: THEME_COLORS.light,
      statusBar: STATUS_BAR_STYLES.light,
    });
  });

  it('as shipped: ?theme=dark is ignored without the dev switch', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    expect(prepaint({ devSwitch: false, appearanceEnabled: false }).theme).toBe('light');
  });

  it('dev switch: ?theme=dark forces Dark with the dark theme-color', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    const r = prepaint({ devSwitch: true, appearanceEnabled: false });
    expect(r).toEqual({
      theme: 'dark',
      classes: 'dark',
      themeColor: THEME_COLORS.dark,
      statusBar: STATUS_BAR_STYLES.dark,
    });
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
              const r = prepaint({ devSwitch, appearanceEnabled });
              expect(r.theme).toBe(expected);
              // ...and leaves the same document state applyTheme would.
              const pre = { cls: r.classes, color: r.themeColor, bar: r.statusBar };
              document.documentElement.className = '';
              applyTheme(document, expected);
              expect(pre).toEqual({
                cls: document.documentElement.className,
                color: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content,
                bar: document.querySelector<HTMLMetaElement>(
                  'meta[name="apple-mobile-web-app-status-bar-style"]',
                )!.content,
              });
            });
          }
        }
      }
    }
  }
});
