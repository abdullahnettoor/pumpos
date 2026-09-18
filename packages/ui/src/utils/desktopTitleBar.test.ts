import { describe, expect, it } from 'vitest';
import { resolveTitleBar, type DesktopTitleBar } from './desktopTitleBar.js';

const controls = {
  minimize: () => {},
  toggleMaximize: () => {},
  close: () => {},
};

const macBar: DesktopTitleBar = {
  controlsSide: 'left',
  controlsInset: 78,
  controls: null,
  getState: () => ({ fullscreen: false, maximized: false }),
  subscribe: () => () => {},
};

const windowsBar: DesktopTitleBar = {
  ...macBar,
  controlsSide: 'right',
  controlsInset: 0,
  controls,
};

describe('resolveTitleBar', () => {
  it('is null on the web, where the browser supplies its own chrome', () => {
    expect(resolveTitleBar(null, { fullscreen: false, maximized: false })).toBeNull();
  });

  it('reserves the leading side for the macOS traffic lights', () => {
    const resolved = resolveTitleBar(macBar, { fullscreen: false, maximized: false });
    expect(resolved).toMatchObject({ controlsSide: 'left', controlsInset: 78, controls: null });
  });

  it('hands Windows/Linux their own controls on the trailing side', () => {
    const resolved = resolveTitleBar(windowsBar, { fullscreen: false, maximized: false });
    expect(resolved?.controlsSide).toBe('right');
    expect(resolved?.controls).toBe(controls);
    // The app's buttons occupy real layout space, so no padding is reserved.
    expect(resolved?.controlsInset).toBe(0);
  });

  it('drops the reserved inset in full screen, where the OS hides its controls', () => {
    const resolved = resolveTitleBar(macBar, { fullscreen: true, maximized: false });
    expect(resolved?.controlsInset).toBe(0);
  });

  it('keeps the app-drawn controls in full screen', () => {
    // An undecorated window in full screen has no OS chrome to fall back on:
    // hiding our own buttons would leave no way back out.
    const resolved = resolveTitleBar(windowsBar, { fullscreen: true, maximized: true });
    expect(resolved?.controls).toBe(controls);
  });

  it('keeps reserving space when merely maximised', () => {
    const resolved = resolveTitleBar(macBar, { fullscreen: false, maximized: true });
    expect(resolved?.controlsInset).toBe(78);
    expect(resolved?.maximized).toBe(true);
  });
});
