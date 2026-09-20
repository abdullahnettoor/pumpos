/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { UpdateNotice, describeUpdateState, summaryLine } from './UpdateNotice.js';
import type { DesktopUpdates } from './useDesktopUpdates.js';
import type { UpdateState } from './types.js';

// A failing assertion must not leak a mounted tree into the next test.
afterEach(cleanup);

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
    // `role="status"` is an implicit polite live region, so the state is
    // announced where it changes rather than by moving the operator's focus.
    expect(screen.getByRole('status')).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
    cleanup();
  });

  it('shows the offered version, the installed version and one line of summary', () => {
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

  it('keeps the notice compact: the body lives in the drawer, not in the notice', () => {
    const long = ['Drawer rounding is fixed.', '', ...Array(20).fill('Another paragraph.')].join(
      '\n',
    );
    render(
      <UpdateNotice
        updates={updates({
          phase: 'available',
          currentVersion: '1.0.0',
          update: { version: '1.1.0', notes: long },
        })}
      />,
    );
    const notice = screen.getByRole('status');
    // The notice carries the first line only, and nothing that scrolls.
    expect(notice.textContent).not.toMatch('Another paragraph.');
    expect(notice.innerHTML).not.toMatch(/overflow:\s*auto/);
    expect(notice.innerHTML).not.toMatch(/max-height/);

    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    expect(screen.getByText(/Another paragraph\./)).toBeTruthy();
    cleanup();
  });

  it('closes the notes drawer without losing the update action', () => {
    const download = vi.fn();
    render(
      <UpdateNotice
        updates={updates(
          { phase: 'available', currentVersion: '1.0.0', update: offered },
          { download },
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    // The drawer carries the primary action too, so reading the notes never
    // puts the decision out of reach behind the backdrop.
    const inDrawer = screen
      .getAllByRole('button', { name: 'Download update' })
      .at(-1) as HTMLButtonElement;
    fireEvent.click(inDrawer);
    expect(download).toHaveBeenCalledTimes(1);
    // Acting closes the drawer and leaves the notice exactly where it was.
    expect(document.querySelector('.drawer-container')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download update' })).toBeTruthy();
    cleanup();
  });

  it('lets the operator close the notes and go back to the notice', () => {
    render(
      <UpdateNotice
        updates={updates({ phase: 'available', currentVersion: '1.0.0', update: offered })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Drawer' }));
    expect(document.querySelector('.drawer-container')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download update' })).toBeTruthy();
    cleanup();
  });

  it('offers no "What\'s new" affordance when the release has no notes', () => {
    render(
      <UpdateNotice
        updates={updates({
          phase: 'available',
          currentVersion: '1.0.0',
          update: { version: '1.1.0', notes: '   ' },
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: "What's new" })).toBeNull();
    cleanup();
  });

  it('never renders release notes as markup, in either surface', () => {
    const markup = '<img src=x onerror="alert(1)">';
    render(
      <UpdateNotice
        updates={updates({
          phase: 'available',
          currentVersion: '1.0.0',
          update: { version: '1.1.0', notes: markup },
        })}
      />,
    );
    expect(screen.getByRole('status').querySelector('img')).toBeNull();
    expect(screen.getAllByText(markup).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    expect(document.querySelector('.drawer-body img')).toBeNull();
    expect(document.querySelector('.drawer-body')?.textContent).toBe(markup);
    cleanup();
  });

  it('renders no link anywhere, so nothing sends an operator to a repository', () => {
    render(
      <UpdateNotice
        updates={updates({
          phase: 'available',
          currentVersion: '1.0.0',
          update: { version: '1.1.0', notes: 'See https://github.com/o/r/pull/1 for detail.' },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    expect(document.querySelectorAll('a').length).toBe(0);
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

  it('is keyboard reachable: the action and the dismissal are both real buttons', () => {
    render(
      <UpdateNotice
        updates={updates({ phase: 'downloaded', currentVersion: '1.0.0', update: offered })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Install and restart' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
    cleanup();
  });

  it('renders nothing once an offer is postponed', () => {
    const { container } = render(
      <UpdateNotice
        updates={updates({
          phase: 'postponed',
          currentVersion: '1.0.0',
          update: offered,
          resume: 'downloaded',
        })}
      />,
    );
    expect(container.innerHTML).toBe('');
    cleanup();
  });

  it('puts an available offer away when the operator dismisses it', () => {
    const postpone = vi.fn();
    render(
      <UpdateNotice
        updates={updates(
          { phase: 'available', currentVersion: '1.0.0', update: offered },
          { postpone },
        )}
      />,
    );
    // "Not now" is Banner's dismissal, not a button of its own: one primary
    // action plus an optional put-away is the shape every state takes. It is
    // named, not left as the generic "Dismiss", so a screen-reader user can
    // tell putting an update away from discarding a stale message.
    screen.getByRole('button', { name: 'Not now' }).click();
    expect(postpone).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('draws determinate progress in the design system, not a native <progress>', () => {
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
    const bar = screen.getByRole('progressbar');
    expect(bar.tagName).not.toBe('PROGRESS');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText('5.0 MB of 10.0 MB (50%)')).toBeTruthy();
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
    // No bar at all rather than one creeping toward a number nobody measured.
    expect(screen.queryByRole('progressbar')).toBeNull();
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
    // Blocked is not failed: the operator can try again once it clears, or put
    // it away and come back to it.
    expect(view?.action?.label).toBe('Try again');
    expect(view?.onDismiss?.label).toBe('Later');
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
    expect(view?.action?.label).toBe(label);
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
    expect(installing?.action).toBeUndefined();

    const ready = describeUpdateState(
      { phase: 'relaunch-ready', currentVersion: '1.0.0', update: offered },
      actions,
    );
    expect(ready?.action?.label).toBe('Restart and update');
    // Nothing to dismiss: the new binary is already on disk.
    expect(ready?.onDismiss).toBeUndefined();
  });
});

describe('summaryLine', () => {
  it('has no notes section at all when the release summary is empty', () => {
    const view = describeUpdateState(
      { phase: 'available', currentVersion: '1.0.0', update: { version: '1.1.0', notes: '  ' } },
      actions,
    );
    expect(view?.summary).toBeUndefined();
    expect(view?.notes).toBeUndefined();
  });

  it('shortens a long summary to one readable line and keeps the body whole', () => {
    const body = `${'Fuel sales now round to the paise so the drawer matches the till at close every single shift.'}\nAnd more.`;
    const view = describeUpdateState(
      { phase: 'available', currentVersion: '1.0.0', update: { version: '1.1.0', notes: body } },
      actions,
    );
    expect(view?.summary?.length).toBeLessThanOrEqual(91);
    expect(view?.summary?.endsWith('…')).toBe(true);
    expect(view?.summary).not.toMatch('And more.');
    // The compact notice never carries the full body; the drawer does.
    expect(view?.notes).toBe(body);
  });

  it('reads past a bullet marker to the first real sentence', () => {
    expect(summaryLine('\n- Drawer rounding is fixed.\n- Faster reports.')).toBe(
      'Drawer rounding is fixed.',
    );
  });
});

describe('UpdateNotice severity', () => {
  it('distinguishes a failure from an offer by the primitive severity, not by copy alone', () => {
    const failed = describeUpdateState(
      {
        phase: 'failed',
        currentVersion: '1.0.0',
        error: { kind: 'offline', message: 'No connection.' },
        retry: 'check',
      },
      actions,
    );
    const available = describeUpdateState(
      { phase: 'available', currentVersion: '1.0.0', update: offered },
      actions,
    );
    expect(failed?.severity).toBe('danger');
    expect(available?.severity).toBe('info');
    expect(
      describeUpdateState(
        { phase: 'restart-blocked', currentVersion: '1.0.0', update: offered, reason: 'Pending.' },
        actions,
      )?.severity,
    ).toBe('warning');
  });

  it('names the put-away differently from a plain dismissal', () => {
    expect(
      describeUpdateState({ phase: 'available', currentVersion: '1.0.0', update: offered }, actions)
        ?.onDismiss?.label,
    ).toBe('Not now');
    expect(
      describeUpdateState({ phase: 'up-to-date', currentVersion: '1.0.0', checkedAt: 0 }, actions)
        ?.onDismiss?.label,
    ).toBe('Dismiss');
  });
});
