// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { THEME_COLORS } from '../theme/config.js';

/**
 * The real More screen is where the Appearance control is mounted, so this pins
 * the shipped behaviour at screen level: no Appearance control, Light applied.
 * Data hooks come from `@pump/ui`, so that package is the mock seam (as in
 * HandoverPanel.dom.test.tsx).
 */
const query = { data: [] as unknown[], isLoading: false };

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useDailyDssrRange: () => query,
    useInventoryStatus: () => query,
    useUsers: () => query,
    useOrganization: () => ({ data: {}, isLoading: false }),
    useStations: () => query,
  };
});
vi.mock('../lib/alerts.js', () => ({ useMobileAlerts: () => [] }));

const { MoreScreen } = await import('./MoreScreen.js');
const { ThemeProvider } = await import('../theme/index.js');

const station = { id: 'st-1', name: 'Test Station', settings: { timezone: 'Asia/Kolkata' } } as any;
const root = () => document.documentElement;

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

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/');
  root().className = '';
  document.head.innerHTML = '';
  window.matchMedia = ((q: string) => ({
    matches: q.includes('dark'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MoreScreen (real screen) theme behaviour', () => {
  it('as shipped: no Appearance control, Light applied even when the OS is dark', () => {
    localStorage.setItem('pump.mobile.theme', 'dark');
    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <MoreScreen station={station} />
      </ThemeProvider>,
    );
    // The screen really rendered...
    expect(screen.getByText('Team')).toBeTruthy();
    // ...without the Appearance control...
    expect(screen.queryByText('Appearance')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    // ...and Light is what is applied.
    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);
    expect(root().style.colorScheme).toBe('light');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      THEME_COLORS.light,
    );
  });

  it('is where the control mounts once Appearance is enabled', () => {
    render(
      <ThemeProvider appearanceEnabled devSwitchEnabled={false}>
        <MoreScreen station={station} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeTruthy();
  });
});
