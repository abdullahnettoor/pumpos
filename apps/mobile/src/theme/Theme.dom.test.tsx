// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppearanceControl } from './AppearanceControl.js';
import { ThemeProvider } from './ThemeProvider.js';
import { STATUS_BAR_STYLES, THEME_COLORS, THEME_STORAGE_KEY } from './config.js';

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

/** The control in isolation; the real mount is covered by shell/MobileShell.dom.test.tsx ("Account sheet"). */
const Screen: React.FC = () => <AppearanceControl />;

const resolvedTheme = () => (root().classList.contains('dark') ? 'dark' : 'light');

function setSystemDark(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const root = () => document.documentElement;
const themeColor = () =>
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content;
const statusBar = () =>
  document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.content;

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
  root().className = '';
  root().style.colorScheme = '';
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  setSystemDark(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('theme (Appearance disabled, as shipped)', () => {
  it('renders Light by default and the Appearance control is not rendered (control alone)', () => {
    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <Screen />
      </ThemeProvider>,
    );
    expect(resolvedTheme()).toBe('light');
    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);
    expect(root().style.colorScheme).toBe('light');
    expect(themeColor()).toBe(THEME_COLORS.light);
    expect(statusBar()).toBe(STATUS_BAR_STYLES.light);
    expect(screen.queryByText('Appearance')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('stays Light when the OS prefers dark or a dark preference is stored', () => {
    setSystemDark(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <Screen />
      </ThemeProvider>,
    );
    expect(resolvedTheme()).toBe('light');
    expect(root().classList.contains('dark')).toBe(false);
  });

  it('ignores ?theme=dark when the dev switch is off (production)', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <Screen />
      </ThemeProvider>,
    );
    expect(root().classList.contains('dark')).toBe(false);
  });

  it('dev switch: ?theme=dark applies the dark class, color-scheme and theme-color', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled>
        <Screen />
      </ThemeProvider>,
    );
    expect(resolvedTheme()).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);
    expect(root().style.colorScheme).toBe('dark');
    expect(themeColor()).toBe(THEME_COLORS.dark);
    expect(statusBar()).toBe(STATUS_BAR_STYLES.dark);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('theme (Appearance enabled: built, awaiting rollout)', () => {
  it('renders the control; choosing Dark applies and persists it', () => {
    render(
      <ThemeProvider appearanceEnabled devSwitchEnabled={false}>
        <Screen />
      </ThemeProvider>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(root().classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);
  });

  it('System follows the OS scheme', () => {
    setSystemDark(true);
    render(
      <ThemeProvider appearanceEnabled devSwitchEnabled={false}>
        <Screen />
      </ThemeProvider>,
    );
    expect(root().classList.contains('dark')).toBe(true);
  });

  it('restores a stored preference on load', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    act(() => {
      render(
        <ThemeProvider appearanceEnabled devSwitchEnabled={false}>
          <Screen />
        </ThemeProvider>,
      );
    });
    expect(resolvedTheme()).toBe('dark');
  });

  it('is a roving-tabindex radiogroup driven by the arrow keys', () => {
    render(
      <ThemeProvider appearanceEnabled devSwitchEnabled={false}>
        <Screen />
      </ThemeProvider>,
    );
    const tabIndexes = () =>
      ['System', 'Light', 'Dark'].map((n) =>
        screen.getByRole('radio', { name: n }).getAttribute('tabindex'),
      );
    expect(tabIndexes()).toEqual(['0', '-1', '-1']);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'System' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Light' }));
    expect(tabIndexes()).toEqual(['-1', '0', '-1']);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Light' }), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'System' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Dark' }), { key: 'Home' });
    expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true');
  });
});
