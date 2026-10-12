// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { APPEARANCE_ENABLED, ThemeProvider } from '@pump/ui';

const root = () => document.documentElement;
const themeColor = () =>
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  root().className = '';
  root().style.colorScheme = '';
  document.head.innerHTML = '<meta name="theme-color" content="#f6f7f4" />';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('desktop theme infrastructure (#501)', () => {
  it('APPEARANCE_ENABLED is false; desktop always renders light by default', () => {
    expect(APPEARANCE_ENABLED).toBe(false);

    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <div data-testid="desktop-shell">Desktop Shell</div>
      </ThemeProvider>,
    );

    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);
    expect(root().style.colorScheme).toBe('light');
    expect(themeColor()).toBe('#f6f7f4');
  });

  it('no Appearance control exists in the UI', () => {
    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <div data-testid="desktop-shell">Desktop Shell</div>
      </ThemeProvider>,
    );

    expect(screen.queryByText(/appearance/i)).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: /appearance/i })).toBeNull();
  });

  it('renders dark mode via dev-only switch (?theme=dark) when enabled', () => {
    window.history.replaceState(null, '', '/?theme=dark');

    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={true}>
        <div data-testid="desktop-shell">Desktop Shell</div>
      </ThemeProvider>,
    );

    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);
    expect(root().style.colorScheme).toBe('dark');
    expect(themeColor()).toBe('#0b0f0d');
  });

  it('ignores ?theme=dark when dev switch is disabled (production)', () => {
    window.history.replaceState(null, '', '/?theme=dark');

    render(
      <ThemeProvider appearanceEnabled={false} devSwitchEnabled={false}>
        <div data-testid="desktop-shell">Desktop Shell</div>
      </ThemeProvider>,
    );

    expect(root().classList.contains('dark')).toBe(false);
    expect(root().classList.contains('light')).toBe(true);
  });
});

describe('desktop index.html pre-paint theme script', () => {
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

  it('has pre-paint script and theme-color meta in head before first paint', () => {
    expect(html).toContain('<meta name="theme-color" content="__THEME_COLOR_LIGHT__" />');
    expect(html).toContain('root.classList.add(theme);');
    expect(html).toContain('root.style.colorScheme = theme;');
  });

  it('executes pre-paint logic to apply light class by default without flashing dark', () => {
    const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(html);
    expect(scriptMatch).toBeTruthy();
    const script = scriptMatch![1]
      .replaceAll('__THEME_DEV_SWITCH__', 'false')
      .replaceAll('__APPEARANCE_ENABLED__', 'false')
      .replaceAll('__THEME_STORAGE_KEY__', 'pump.theme')
      .replaceAll('__THEME_COLOR_LIGHT__', '#f6f7f4')
      .replaceAll('__THEME_COLOR_DARK__', '#0b0f0d')
      .replaceAll('__STATUS_BAR_LIGHT__', 'default')
      .replaceAll('__STATUS_BAR_DARK__', 'black-translucent');

    new Function(script)();

    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);
    expect(themeColor()).toBe('#f6f7f4');
  });

  it('executes pre-paint logic with dev-switch to apply dark class before first paint', () => {
    window.history.replaceState(null, '', '/?theme=dark');
    const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(html);
    const script = scriptMatch![1]
      .replaceAll('__THEME_DEV_SWITCH__', 'true')
      .replaceAll('__APPEARANCE_ENABLED__', 'false')
      .replaceAll('__THEME_STORAGE_KEY__', 'pump.theme')
      .replaceAll('__THEME_COLOR_LIGHT__', '#f6f7f4')
      .replaceAll('__THEME_COLOR_DARK__', '#0b0f0d')
      .replaceAll('__STATUS_BAR_LIGHT__', 'default')
      .replaceAll('__STATUS_BAR_DARK__', 'black-translucent');

    new Function(script)();

    expect(root().classList.contains('dark')).toBe(true);
    expect(root().classList.contains('light')).toBe(false);
    expect(themeColor()).toBe('#0b0f0d');
  });
});
