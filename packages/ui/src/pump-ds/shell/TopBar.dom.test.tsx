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
