// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppearanceControl } from './AppearanceControl.js';
import { ThemeProvider, useTheme } from './ThemeProvider.js';
import { THEME_STORAGE_KEY } from './config.js';
import { THEME_COLORS } from './theme.js';

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

/** A minimal screen: the control plus a readout of the resolved theme. */
const Probe: React.FC = () => {
  const { resolved } = useTheme();
  return <p data-testid="resolved">{resolved}</p>;
};
const Screen: React.FC = () => (
  <>
    <Probe />
    <AppearanceControl />
  </>
);

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
  it('renders Light by default and the Appearance control is not rendered', () => {
    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <Screen />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);
    expect(root().style.colorScheme).toBe('light');
    expect(themeColor()).toBe(THEME_COLORS.light);
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
    expect(screen.getByTestId('resolved').textContent).toBe('light');
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
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);
    expect(root().style.colorScheme).toBe('dark');
    expect(themeColor()).toBe(THEME_COLORS.dark);
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
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });
});
