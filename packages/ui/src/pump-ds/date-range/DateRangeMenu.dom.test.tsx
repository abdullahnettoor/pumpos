// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateRangeMenu } from './DateRangeMenu.js';
import type { DateRange } from './range.js';

// 14 Oct 2026, 03:00 IST. With a 06:00 Day Start the station is still on 13 Oct.
const NOW = new Date('2026-10-13T21:30:00.000Z');
const IST = { timeZone: 'Asia/Kolkata', dayStartsAt: '00:00' };

function Harness({
  initial = { from: '2026-10-01', to: '2026-10-14' },
  clock = IST,
  onChange,
}: {
  initial?: DateRange;
  clock?: { timeZone: string; dayStartsAt: string };
  onChange?: (r: DateRange) => void;
}) {
  const [range, setRange] = useState(initial);
  return (
    <>
      <DateRangeMenu
        value={range}
        clock={clock}
        now={NOW}
        onChange={(r) => {
          setRange(r);
          onChange?.(r);
        }}
      />
      <button type="button">Outside</button>
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: /^Date range/ });

describe('DateRangeMenu', () => {
  afterEach(cleanup);

  it('shows the preset and its dates on one button, never YYYY-MM-DD', () => {
    render(<Harness />);
    expect(trigger().textContent).toBe('This month1–14 Oct');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('lists every preset with its dates and applies a choice at once', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());

    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual([
      'Today14 Oct',
      'Yesterday13 Oct',
      'Last 7 days8–14 Oct',
      'This week12–14 Oct',
      'This month1–14 Oct',
      expect.stringMatching(/^Last month1–30 Sept?$/),
      expect.stringMatching(/^Last 30 days15 Sept? – 14 Oct$/),
      'This year1 Jan – 14 Oct',
    ]);
    expect(screen.getByRole('menuitemradio', { name: /This month/ })).toHaveProperty(
      'ariaChecked',
      'true',
    );
    // No Apply button: the click is the choice.
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();

    fireEvent.click(screen.getByRole('menuitemradio', { name: /Last 7 days/ }));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-08', to: '2026-10-14' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger().textContent).toBe('Last 7 days8–14 Oct');
    expect(document.activeElement).toBe(trigger());
  });

  it('anchors presets on the station clock (Day Start)', () => {
    const onChange = vi.fn();
    render(
      <Harness
        clock={{ timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' }}
        initial={{ from: '2026-10-01', to: '2026-10-13' }}
        onChange={onChange}
      />,
    );
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Today/ }));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-13', to: '2026-10-13' });
  });

  it('applies a custom From/To instantly and shows Custom', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-03' } });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-03', to: '2026-10-14' });
    // Moving From past To moves To with it.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-20' } });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-20', to: '2026-10-20' });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-25' } });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-20', to: '2026-10-25' });
    expect(trigger().textContent).toBe('Custom20–25 Oct');
    // The popover stays open while the dates are being typed.
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('follows the menu keyboard pattern and returns focus on Escape', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    const menu = screen.getByRole('menu');
    // Opens on the selected preset.
    expect(document.activeElement?.textContent).toMatch(/^This month/);

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toMatch(/^Last month/);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement?.textContent).toMatch(/^This year/);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toMatch(/^Today/);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toMatch(/^This year/);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement?.textContent).toMatch(/^Today/);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on a click outside', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
