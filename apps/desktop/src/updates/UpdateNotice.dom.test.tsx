/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { UpdateNotice, describeUpdateState } from './UpdateNotice.js';
import type { DesktopUpdates } from './useDesktopUpdates.js';
import type { UpdateState } from './types.js';

const noop = () => {};
const actions = {
  check: noop,
  download: noop,
  install: noop,
  relaunch: noop,
  postpone: noop,
  retry: noop,
  dismiss: noop,
};

function updates(
  state: UpdateState | null,
  overrides: Partial<DesktopUpdates> = {},
): DesktopUpdates {
  return {
    enabled: true,
    currentVersion: state?.currentVersion ?? '1.0.0',
    state,
    ...actions,
    ...overrides,
  };
}

const offered = { version: '1.1.0', notes: 'Fixes drawer rounding.' };

describe('UpdateNotice rendering', () => {
  it('renders nothing outside a packaged production build', () => {
    const { container } = render(
      <UpdateNotice
        updates={updates(
          { phase: 'available', currentVersion: '1.0.0', update: offered },
          { enabled: false },
        )}
      />,
    );
    expect(container.innerHTML).toBe('');
    cleanup();
  });

  it('renders nothing while idle, so the shell is untouched until there is news', () => {
    const { container } = render(
      <UpdateNotice updates={updates({ phase: 'idle', currentVersion: '1.0.0' })} />,
    );
    expect(container.innerHTML).toBe('');
    cleanup();
  });

  it('announces state to assistive technology without stealing focus', () => {
    render(<UpdateNotice updates={updates({ phase: 'checking', currentVersion: '1.0.0' })} />);
    const notice = screen.getByRole('status');
    expect(notice.getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement).toBe(document.body);
    cleanup();
  });

  it('shows the offered version, the installed version and the release notes', () => {
    render(
      <UpdateNotice
        updates={updates({ phase: 'available', currentVersion: '1.0.0', update: offered })}
      />,
    );
    expect(screen.getByText('PumpOS 1.1.0 is available')).toBeTruthy();
    expect(screen.getByText(/You are on 1\.0\.0/)).toBeTruthy();
    expect(screen.getByText('Fixes drawer rounding.')).toBeTruthy();
    cleanup();
  });

  it('never renders release notes as markup', () => {
    render(
      <UpdateNotice
        updates={updates({
          phase: 'available',
          currentVersion: '1.0.0',
          update: { version: '1.1.0', notes: '<img src=x onerror="alert(1)">' },
        })}
      />,
    );
    expect(screen.getByRole('status').querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
    cleanup();
  });

  it('requires an explicit click to download', async () => {
    const download = vi.fn();
    render(
      <UpdateNotice
        updates={updates(
          { phase: 'available', currentVersion: '1.0.0', update: offered },
          { download },
        )}
      />,
    );
    const button = screen.getByRole('button', { name: 'Download update' });
    button.click();
    expect(download).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('is keyboard reachable: every action is a real button', () => {
    render(
      <UpdateNotice
        updates={updates({ phase: 'downloaded', currentVersion: '1.0.0', update: offered })}
      />,
    );
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toContain('Install and restart');
    expect(names).toContain('Later');
    cleanup();
  });

  it('reports determinate progress when the total size is known', () => {
    render(
      <UpdateNotice
        updates={updates({
          phase: 'downloading',
          currentVersion: '1.0.0',
          update: offered,
          progress: { downloadedBytes: 5 * 1024 * 1024, totalBytes: 10 * 1024 * 1024 },
        })}
      />,
    );
    const bar = screen.getByRole('progressbar') as HTMLProgressElement;
    expect(bar.value).toBe(5 * 1024 * 1024);
    expect(bar.max).toBe(10 * 1024 * 1024);
    cleanup();
  });

  it('stays honestly indeterminate when the server gave no content length', () => {
    render(
      <UpdateNotice
        updates={updates({
          phase: 'downloading',
          currentVersion: '1.0.0',
          update: offered,
          progress: { downloadedBytes: 1024 * 1024, totalBytes: null },
        })}
      />,
    );
    const bar = screen.getByRole('progressbar') as HTMLProgressElement;
    expect(bar.hasAttribute('value')).toBe(false);
    expect(screen.getByText('1.0 MB downloaded')).toBeTruthy();
    cleanup();
  });
});

describe('describeUpdateState', () => {
  it('explains a blocked restart with its concrete reason', () => {
    const view = describeUpdateState(
      {
        phase: 'restart-blocked',
        currentVersion: '1.0.0',
        update: offered,
        reason: '3 entries have not reached the cloud yet.',
      },
      actions,
    );
    expect(view?.title).toBe('Restart postponed');
    expect(view?.detail).toMatch('3 entries have not reached the cloud yet.');
    // Blocked is not failed: the operator can try again once it clears.
    expect(view?.actions.map((a) => a.label)).toEqual(['Try again', 'Later']);
  });

  it.each([
    ['check', 'Check again'],
    ['download', 'Retry download'],
    ['install', 'Retry install'],
  ] as const)('offers a %s retry', (retry, label) => {
    const view = describeUpdateState(
      {
        phase: 'failed',
        currentVersion: '1.0.0',
        error: { kind: 'offline', message: 'No connection.' },
        retry,
      },
      actions,
    );
    expect(view?.actions[0].label).toBe(label);
  });

  it('confirms the installed version when a manual check finds nothing', () => {
    const view = describeUpdateState(
      { phase: 'up-to-date', currentVersion: '1.2.3', checkedAt: 0 },
      actions,
    );
    expect(view?.title).toBe('PumpOS is up to date');
    expect(view?.detail).toMatch('1.2.3');
  });

  it('never offers a restart until installation has succeeded', () => {
    const installing = describeUpdateState(
      { phase: 'installing', currentVersion: '1.0.0', update: offered },
      actions,
    );
    expect(installing?.actions).toEqual([]);

    const ready = describeUpdateState(
      { phase: 'relaunch-ready', currentVersion: '1.0.0', update: offered },
      actions,
    );
    expect(ready?.actions.map((a) => a.label)).toEqual(['Restart and update']);
  });
});
