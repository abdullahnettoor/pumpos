// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DesktopDownloads } from '@pump/shared';

const state: { data?: DesktopDownloads; isLoading: boolean; isError: boolean } = {
  isLoading: false,
  isError: false,
};
vi.mock('../../query/hooks.js', () => ({ useDesktopDownloads: () => state }));
const startDownload = vi.fn();
vi.mock('./desktopDownload.js', async (orig) => ({
  ...(await orig<typeof import('./desktopDownload.js')>()),
  startDownload: (u: string) => startDownload(u),
}));

import { DesktopAppPanel } from './DesktopAppPanel.js';

const avail = (version: string, isLatest = true) => ({
  available: true as const,
  version,
  sizeBytes: 50 * 1024 * 1024,
  url: `https://dl/${version}`,
  isLatest,
});

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
  state.data = {
    'windows-x64': avail('1.6.0'),
    macos: avail('1.5.0', false),
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  startDownload.mockReset();
});

describe('DesktopAppPanel', () => {
  it('lists the recommended platform first', () => {
    render(<DesktopAppPanel />);
    const rows = screen.getAllByTestId(/desktop-option-/);
    expect(rows[0].getAttribute('data-testid')).toBe('desktop-option-windows-x64');
    expect(rows[0].textContent).toContain('Recommended');
  });

  it('labels a fallback version', () => {
    render(<DesktopAppPanel />);
    const mac = screen.getByTestId('desktop-option-macos').textContent;
    expect(mac).toContain('Version 1.5.0');
    expect(mac).toContain("newer releases don't include a macOS installer yet");
  });

  it('shows no link for a platform that has never shipped', () => {
    state.data = { ...state.data!, macos: { available: false } };
    render(<DesktopAppPanel />);
    const missing = screen.getByTestId('desktop-option-macos');
    expect(missing.textContent).toContain('Not available yet');
    expect(missing.querySelector('button')).toBeNull();
  });

  it('starts the file download and records it', () => {
    const onDownloaded = vi.fn();
    render(<DesktopAppPanel onDownloaded={onDownloaded} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Download/ })[0]);
    expect(startDownload).toHaveBeenCalledWith('https://dl/1.6.0');
    expect(onDownloaded).toHaveBeenCalled();
  });

  it('shows a friendly message when downloads cannot load', () => {
    state.data = undefined;
    state.isError = true;
    render(<DesktopAppPanel />);
    expect(screen.getByText(/temporarily unavailable/)).toBeTruthy();
    state.isError = false;
  });
});
