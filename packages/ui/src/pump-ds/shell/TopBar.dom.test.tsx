// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TopBar, type TitleBarIntegration } from './TopBar.js';

afterEach(cleanup);

const baseProps = {
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
 * The station name is quiet text next to the brand (no chip). Business day,
 * station chip, and the sync pulse moved to the bottom StatusBar, so the top
 * bar is navigation + actions only and never wraps.
 */
describe('TopBar station name', () => {
  it('renders the station name as plain text', () => {
    render(<TopBar {...baseProps} stationName="Hosur Road HP" />);
    const el = screen.getByTestId('topbar-station');
    expect(el.textContent).toContain('Hosur Road HP');
    // It is a text label, not the old bordered/skeleton chip.
    expect(el.querySelector('.pump-skeleton')).toBeNull();
  });

  it('renders no station element when there is no station to name', () => {
    render(<TopBar {...baseProps} />);
    expect(screen.queryByTestId('topbar-station')).toBeNull();
  });
});

describe('TopBar no longer carries ambient status', () => {
  it('renders no business-day chip or sync pulse (those live in the StatusBar)', () => {
    render(<TopBar {...baseProps} stationName="Hosur Road HP" />);
    // No sync-status role element in the top bar anymore.
    expect(screen.queryByRole('status')).toBeNull();
    // No business-day trigger text.
    expect(screen.queryByText(/Business Day/i)).toBeNull();
  });
});

describe('TopBar search trigger', () => {
  const observed: Array<(entries: any[]) => void> = [];

  function mockWidth(width: number) {
    observed.length = 0;
    (globalThis as any).ResizeObserver = class {
      constructor(cb: (entries: any[]) => void) {
        observed.push(cb);
      }
      observe() {
        // Deliver the width synchronously on observe.
        observed[observed.length - 1]([{ contentRect: { width } }]);
      }
      disconnect() {}
    };
  }

  it('shows the full centered search when the bar is wide', () => {
    mockWidth(1200);
    render(<TopBar {...baseProps} stationName="Hosur Road HP" />);
    const search = screen.getByLabelText('Search');
    // The full trigger carries the placeholder text; the icon fallback does not.
    expect(search.textContent).toContain('Search');
    expect(search.className).toContain('left-1/2');
  });

  it('collapses to an icon-only search button when the bar is narrow', () => {
    mockWidth(700);
    render(<TopBar {...baseProps} stationName="Hosur Road HP" />);
    const search = screen.getByLabelText('Search');
    // Icon button: no centered-absolute positioning, sits in the right cluster.
    expect(search.className).not.toContain('left-1/2');
  });
});
