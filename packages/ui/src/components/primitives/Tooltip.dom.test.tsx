import { afterEach, describe, it, expect, vi } from 'vitest';
import React from 'react';
import { cleanup, render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { Tooltip, TooltipProvider } from './Tooltip.js';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: TooltipProvider });

afterEach(cleanup);

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
  });
});
