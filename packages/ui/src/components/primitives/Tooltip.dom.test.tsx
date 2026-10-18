import { afterEach, describe, it, expect, vi } from 'vitest';
import React from 'react';
import { cleanup, render as rtlRender, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip, TooltipProvider } from './Tooltip.js';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: TooltipProvider });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Tooltip', () => {
  it('places the bubble on the requested side', () => {
    render(
      <Tooltip content="Shifts" placement="right">
        <button>Shifts</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Shifts' }));
    const bubble = screen.getByRole('tooltip').closest('[data-side]');
    expect(bubble?.getAttribute('data-side')).toBe('right');
  });

  describe('disabled', () => {
    const setup = () => {
      const onOpen = vi.fn();
      document.addEventListener('tooltip.open', onOpen);
      render(
        <>
          <Tooltip content="Live">
            <button>live</button>
          </Tooltip>
          <Tooltip content="Off" disabled>
            <button>off</button>
          </Tooltip>
        </>,
      );
      return { onOpen, off: screen.getByRole('button', { name: 'off' }) };
    };

    it('never opens on focus or hover', () => {
      const { onOpen, off } = setup();
      fireEvent.focus(off);
      fireEvent.pointerMove(off, { pointerType: 'mouse' });
      fireEvent.pointerDown(off);
      expect(screen.queryByRole('tooltip')).toBeNull();
      expect(off.hasAttribute('aria-describedby')).toBe(false);
      expect(off.getAttribute('data-state')).toBe('closed');
      expect(onOpen).not.toHaveBeenCalled();
      document.removeEventListener('tooltip.open', onOpen);
    });

    it('leaves another open tooltip open', () => {
      const { onOpen, off } = setup();
      fireEvent.focus(screen.getByRole('button', { name: 'live' }));
      expect(screen.getByRole('tooltip').textContent).toBe('Live');
      onOpen.mockClear();
      fireEvent.focus(off);
      fireEvent.pointerMove(off, { pointerType: 'mouse' });
      expect(screen.getByRole('tooltip').textContent).toBe('Live');
      expect(onOpen).not.toHaveBeenCalled();
      document.removeEventListener('tooltip.open', onOpen);
    });

    it('does not preventDefault pointerdown', () => {
      const { onOpen, off } = setup();
      const ev = new Event('pointerdown', { bubbles: true, cancelable: true });
      expect(off.dispatchEvent(ev)).toBe(true);
      expect(ev.defaultPrevented).toBe(false);
      document.removeEventListener('tooltip.open', onOpen);
    });
  });

  describe('toggling disabled', () => {
    const ui = (disabled: boolean) => (
      <Tooltip content="Tip" disabled={disabled}>
        <button>btn</button>
      </Tooltip>
    );
    const btn = () => screen.getByRole('button', { name: 'btn' });

    it('stays controlled (no React controlled/uncontrolled warning)', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { rerender } = render(ui(false));
      rerender(ui(true));
      rerender(ui(false));
      const msgs = [...err.mock.calls, ...warn.mock.calls].map((c) => c.map(String).join(' '));
      expect(msgs.filter((m) => /controlled/i.test(m))).toEqual([]);
    });

    it('does not reappear after focus -> disable -> blur -> enable', () => {
      const { rerender } = render(ui(false));
      fireEvent.focus(btn());
      expect(screen.getByRole('tooltip')).toBeTruthy();
      rerender(ui(true));
      fireEvent.blur(btn());
      rerender(ui(false));
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('opens when enabled while still keyboard-focused', () => {
      const { rerender } = render(ui(true));
      act(() => btn().focus());
      expect(screen.queryByRole('tooltip')).toBeNull();
      rerender(ui(false));
      expect(screen.getByRole('tooltip').textContent).toBe('Tip');
    });
  });
});
