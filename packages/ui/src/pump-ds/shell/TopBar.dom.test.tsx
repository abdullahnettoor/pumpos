// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TopBar, type TitleBarIntegration } from './TopBar.js';

afterEach(cleanup);

const baseProps = {
  businessDate: '09 Jul 2026',
  businessDayStatus: 'open' as const,
  syncStatus: 'online' as const,
  onToggleSidebar: () => {},
  brand: 'PumpOS',
  userName: 'Asha Menon',
  userInitials: 'AM',
};

const DRAG = '[data-tauri-drag-region]';

describe('TopBar on the web', () => {
  it('is not a drag region and reserves no window-control space', () => {
    const { container } = render(<TopBar {...baseProps} />);

    expect(container.querySelectorAll(DRAG)).toHaveLength(0);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.style.paddingLeft).toBe('');
    expect(bar.style.paddingRight).toBe('');
    expect(screen.queryByLabelText('Close window')).toBeNull();
  });
});

describe('TopBar as the desktop title bar', () => {
  const macTitleBar: TitleBarIntegration = {
    controlsSide: 'left',
    controlsInset: 78,
    maximized: false,
    controls: null,
  };

  it('drags the window from its own surface', () => {
    const { container } = render(<TopBar {...baseProps} titleBar={macTitleBar} />);
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.hasAttribute('data-tauri-drag-region')).toBe(true);
  });

  it('reserves the leading side for the macOS traffic lights', () => {
    const { container } = render(<TopBar {...baseProps} titleBar={macTitleBar} />);
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.style.paddingLeft).toBe('78px');
    expect(bar.style.paddingRight).toBe('');
  });

  it('falls back to the bar’s normal padding in full screen, where the inset is 0', () => {
    const { container } = render(
      <TopBar {...baseProps} titleBar={{ ...macTitleBar, controlsInset: 0 }} />,
    );
    const bar = container.firstElementChild as HTMLElement;

    expect(bar.style.paddingLeft).toBe('');
  });

  it('keeps every interactive control out of the drag region', () => {
    const { container } = render(<TopBar {...baseProps} titleBar={macTitleBar} />);

    // Tauri only drags when the event target itself carries the attribute, so
    // a control inheriting one from an ancestor would be swallowed.
    for (const control of container.querySelectorAll('button')) {
      expect(control.hasAttribute('data-tauri-drag-region')).toBe(false);
    }
  });

  it('leaves the sidebar toggle clickable', () => {
    const onToggleSidebar = vi.fn();
    render(<TopBar {...baseProps} onToggleSidebar={onToggleSidebar} titleBar={macTitleBar} />);

    fireEvent.click(screen.getByLabelText('Toggle sidebar'));
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('draws no window buttons where the OS still paints its own', () => {
    render(<TopBar {...baseProps} titleBar={macTitleBar} />);

    expect(screen.queryByLabelText('Close window')).toBeNull();
  });
});

describe('TopBar on an undecorated (Windows/Linux) window', () => {
  const controls = { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() };
  const winTitleBar: TitleBarIntegration = {
    controlsSide: 'right',
    controlsInset: 0,
    maximized: false,
    controls,
  };

  it('draws working window controls', () => {
    render(<TopBar {...baseProps} titleBar={winTitleBar} />);

    fireEvent.click(screen.getByLabelText('Minimise window'));
    fireEvent.click(screen.getByLabelText('Maximise window'));
    fireEvent.click(screen.getByLabelText('Close window'));

    expect(controls.minimize).toHaveBeenCalledTimes(1);
    expect(controls.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(controls.close).toHaveBeenCalledTimes(1);
  });

  it('offers restore rather than maximise once maximised', () => {
    render(<TopBar {...baseProps} titleBar={{ ...winTitleBar, maximized: true }} />);

    expect(screen.getByLabelText('Restore window')).toBeTruthy();
    expect(screen.queryByLabelText('Maximise window')).toBeNull();
  });
});

describe('the brand slot as part of the drag region', () => {
  const titleBar: TitleBarIntegration = {
    controlsSide: 'left',
    controlsInset: 78,
    maximized: false,
    controls: null,
  };

  it('does not let a graphical brand swallow the window drag', () => {
    // Tauri only drags when the event target ITSELF carries the attribute, so
    // an <svg> logo sitting in the slot would become the target and kill the
    // drag over the one element users instinctively grab. The slot is
    // decorative, so its contents take no pointer events.
    const { container } = render(
      <TopBar {...baseProps} titleBar={titleBar} brand={<svg data-testid="logo" />} />,
    );

    const slot = screen.getByTestId('logo').parentElement as HTMLElement;
    expect(slot.className).toContain('pointer-events-none');
    // The pointer falls through to the bar itself, which is the drag region.
    expect(slot.closest(DRAG)).toBe(container.firstElementChild);
  });

  it('leaves the brand interactive on the web, where there is no drag to protect', () => {
    render(<TopBar {...baseProps} brand={<svg data-testid="logo" />} />);

    const slot = screen.getByTestId('logo').parentElement as HTMLElement;
    expect(slot.className).not.toContain('pointer-events-none');
  });
});

/**
 * The shell now renders before the station list arrives, so the station chip
 * is absent for the first moment of every sign-in. It sits in a flex row to
 * the left of the search bar: appearing late would shove everything after it
 * sideways, which is exactly the shell-pop the shell-first change is supposed
 * to avoid.
 */
describe('TopBar while the station list is still loading', () => {
  const chipOf = (c: HTMLElement) => c.querySelector('[data-testid="topbar-station"]');

  it('holds the chip slot open with a skeleton instead of leaving a gap', () => {
    const { container } = render(<TopBar {...baseProps} stationsLoading />);

    const chip = chipOf(container);
    expect(chip).toBeTruthy();
    expect(chip?.querySelector('.pump-skeleton')).toBeTruthy();
  });

  it('keeps the slot the same shape once the real name arrives', () => {
    // jsdom does no layout, so this compares the box the chip is drawn in
    // rather than measuring pixels: same element, same classes, same sibling
    // position. If those hold, the only thing that changed inside is text.
    const loading = render(<TopBar {...baseProps} stationsLoading />);
    const before = chipOf(loading.container) as HTMLElement;
    const beforeClasses = before.className;
    const beforeIndex = Array.from(before.parentElement!.children).indexOf(before);
    cleanup();

    const loaded = render(<TopBar {...baseProps} stationLabel="Hosur Road HP" />);
    const after = chipOf(loaded.container) as HTMLElement;

    expect(after.className).toBe(beforeClasses);
    expect(Array.from(after.parentElement!.children).indexOf(after)).toBe(beforeIndex);
    expect(after.querySelector('.pump-skeleton')).toBeNull();
    expect(after.textContent).toContain('Hosur Road HP');
  });

  it('renders no chip at all when there is genuinely no station to name', () => {
    // Not loading and no label is a real state (org-level console views), and
    // must not leave a permanent skeleton shimmering in the bar.
    const { container } = render(<TopBar {...baseProps} />);

    expect(chipOf(container)).toBeNull();
  });
});
