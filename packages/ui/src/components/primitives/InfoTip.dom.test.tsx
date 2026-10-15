import { afterEach, describe, it, expect } from 'vitest';
import React from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { InfoTip } from './InfoTip.js';
import { Tooltip } from './Tooltip.js';

afterEach(cleanup);

// #603: both bubbles are Radix tooltips, portalled to <body> so a trigger at
// the window's edge (the DSR info tip) keeps its bubble on screen.
describe('InfoTip', () => {
  const tip = () => screen.getByRole('button', { name: 'About the DSR' });

  it('opens on focus, in a portal outside its container', () => {
    const { container } = render(<InfoTip label="About the DSR">How the DSR is built</InfoTip>);
    fireEvent.focus(tip());
    const bubble = screen.getByRole('tooltip');
    expect(bubble.textContent).toBe('How the DSR is built');
    expect(container.contains(bubble)).toBe(false);
    expect(tip().getAttribute('aria-describedby')).toBe(bubble.id);
    fireEvent.blur(tip());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a click pins it open; a second click, Escape or a click outside closes it', async () => {
    render(
      <>
        <InfoTip label="About the DSR">How the DSR is built</InfoTip>
        <button type="button">Elsewhere</button>
      </>,
    );
    fireEvent.click(tip());
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(tip().getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(tip());
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.click(tip());
    fireEvent.keyDown(tip(), { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.click(tip());
    // Radix listens for the outside press from the next tick.
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Tooltip', () => {
  it('describes its trigger on focus', () => {
    render(
      <Tooltip content="Reconciles at shift close">
        <button type="button">Drawer</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Drawer' });
    fireEvent.focus(trigger);
    const bubble = screen.getByRole('tooltip');
    expect(bubble.textContent).toBe('Reconciles at shift close');
    expect(trigger.getAttribute('aria-describedby')).toBe(bubble.id);
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
