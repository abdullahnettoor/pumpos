// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateRangeMenu } from './DateRangeMenu.js';
import { calendarDay, datePicker, pickDate, pickedDate } from '../../test/datePicker.js';
import type { DateRange } from './range.js';

// 14 Oct 2026, 03:00 IST. With a 06:00 Day Start the station is still on 13 Oct.
const NOW = new Date('2026-10-13T21:30:00.000Z');
const IST = { timeZone: 'Asia/Kolkata', dayStartsAt: '00:00' };

function Harness({
  initial = { from: '2026-10-01', to: '2026-10-14' },
  clock = IST,
  onChange,
  align,
}: {
  align?: 'start' | 'end';
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
        align={align}
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
      'Last month1–30 Sep',
      'Last 30 days15 Sep – 14 Oct',
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

  it('applies a complete, ordered custom From/To at once and shows Custom', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    pickDate('From', '2026-10-03');
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-03', to: '2026-10-14' });
    pickDate('To', '2026-10-10');
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-03', to: '2026-10-10' });
    expect(trigger().textContent).toBe('Custom3–10 Oct');
    // The popover stays open while the dates are being picked.
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('shows the custom dates as pickers, not native date inputs (#609)', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const pop = screen.getByTestId('date-range-popover');
    expect(pop.querySelector('input[type="date"]')).toBeNull();
    expect(datePicker('From').textContent).toContain('Thu 1 Oct 2026');
    expect(datePicker('To').textContent).toContain('Wed 14 Oct 2026');
  });

  // Pages the calendar back ~320 months one click at a time (~3s alone), so the
  // default 5s budget is too tight when the whole suite runs in parallel.
  it('offers no custom date after the station today or before 2000', { timeout: 15_000 }, () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(datePicker('To'));
    expect(calendarDay('2026-10-14')?.disabled).toBe(false);
    expect(calendarDay('2026-10-15')?.disabled).toBe(true);
    // 2000 is the earliest month the calendar pages back to.
    expect(calendarDay('2000-01-01')?.disabled).toBe(false);
    expect(calendarDay('1999-12-31')).toBeNull();
  });

  it('keeps the menu open while a From/To calendar is used', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(datePicker('From'));
    const day = calendarDay('2026-10-05')!;
    // The calendar is portalled outside the popover: a press there is inside.
    fireEvent.mouseDown(day);
    expect(screen.getByRole('menu')).toBeTruthy();
    // Escape closes only the calendar.
    fireEvent.keyDown(day, { key: 'Escape' });
    expect(screen.queryByTestId('date-picker-popover')).toBeNull();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('reorders a backwards range only when focus leaves the pair', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    pickDate('To', '2026-09-20');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.focusOut(datePicker('To'));
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-20', to: '2026-10-01' });

    pickDate('From', '2026-10-05');
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.focusOut(datePicker('From'));
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-05' });
  });

  it('does not commit From while focus moves on to To', () => {
    const onChange = vi.fn();
    render(<Harness initial={{ from: '2026-09-01', to: '2026-09-30' }} onChange={onChange} />);
    fireEvent.click(trigger());
    pickDate('From', '2026-10-10');
    // Tab from From to To: the range is still being built.
    fireEvent.focusOut(datePicker('From'), { relatedTarget: datePicker('To') });
    expect(onChange).not.toHaveBeenCalled();
    expect(pickedDate('From')).toBe('2026-10-10');
    pickDate('To', '2026-10-14');
    fireEvent.focusOut(datePicker('To'), { relatedTarget: datePicker('From') });
    expect(onChange.mock.calls).toEqual([[{ from: '2026-10-10', to: '2026-10-14' }]]);
    expect(trigger().textContent).toBe('Custom10–14 Oct');
  });

  it('commits the draft when the popover closes on a click outside', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    pickDate('To', '2026-09-20');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(onChange.mock.calls).toEqual([[{ from: '2026-09-20', to: '2026-10-01' }]]);
  });

  it('discards the picked draft on Escape, and the next opening starts from the applied range', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    pickDate('To', '2026-09-20');
    const to = datePicker('To');
    to.focus();
    fireEvent.keyDown(to, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger().textContent).toBe('This month1–14 Oct');
    fireEvent.click(trigger());
    expect(pickedDate('To')).toBe('2026-10-14');
  });

  it('opens above drawers (z-index 1050, as Combobox)', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    expect(screen.getByTestId('date-range-popover').className).toContain('z-[1050]');
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

  it('portals the popover out of clipping parents, fixed under the trigger', () => {
    const { container } = render(
      <div className="overflow-hidden">
        <Harness />
      </div>,
    );
    rect(trigger(), { left: 40, top: 100, width: 200, height: 32 });
    fireEvent.click(trigger());
    const pop = screen.getByTestId('date-range-popover');
    expect(container.contains(pop)).toBe(false);
    expect(pop.parentElement).toBe(document.body);
    expect(pop.style.position).toBe('fixed');
    expect(pop.style.top).toBe('138px');
    expect(pop.style.left).toBe('40px');
    // A press inside the portalled popover is not a click outside.
    fireEvent.mouseDown(datePicker('From'));
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('flips above the trigger when there is no room below', () => {
    render(<Harness />);
    rect(trigger(), { left: 40, top: window.innerHeight - 40, width: 200, height: 32 });
    popoverHeight = 400;
    fireEvent.click(trigger());
    const pop = screen.getByTestId('date-range-popover');
    expect(pop.style.top).toBe('');
    expect(pop.style.bottom).toBe('46px');
  });

  it('lines up with the trigger end in the right half, or as asked', () => {
    render(<Harness />);
    rect(trigger(), { left: window.innerWidth - 240, top: 100, width: 200, height: 32 });
    fireEvent.click(trigger());
    const pop = screen.getByTestId('date-range-popover');
    expect(pop.style.left).toBe('');
    expect(pop.style.right).toBe('40px');
    cleanup();

    render(<Harness align="start" />);
    rect(trigger(), { left: window.innerWidth - 240, top: 100, width: 200, height: 32 });
    fireEvent.click(trigger());
    expect(screen.getByTestId('date-range-popover').style.left).toBe(
      `${window.innerWidth - 240}px`,
    );
  });

  it('keeps Tab inside the popover and returns focus to the trigger on the way out', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const pop = screen.getByTestId('date-range-popover');
    expect(pop.contains(document.activeElement)).toBe(true);

    const from = datePicker('From');
    const to = datePicker('To');
    // The custom fields are in the Tab order after the presets.
    expect(from.tabIndex).toBe(0);
    from.focus();
    fireEvent.keyDown(from, { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.textContent).toMatch(/^This month/);

    to.focus();
    fireEvent.keyDown(to, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

let popoverHeight = 0;
const rects = new WeakMap<Element, DOMRect>();
function rect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  rects.set(el, {
    ...r,
    x: r.left,
    y: r.top,
    right: r.left + r.width,
    bottom: r.top + r.height,
    toJSON: () => r,
  } as DOMRect);
}
const realRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  popoverHeight = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const own = rects.get(this);
    if (own) return own;
    if ((this as HTMLElement).dataset?.testid === 'date-range-popover') {
      const h = popoverHeight;
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 320,
        bottom: h,
        width: 320,
        height: h,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return realRect.call(this);
  });
});
