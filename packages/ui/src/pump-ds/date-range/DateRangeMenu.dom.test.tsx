// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-03' } });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-03', to: '2026-10-14' });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-10' } });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-03', to: '2026-10-10' });
    expect(trigger().textContent).toBe('Custom3–10 Oct');
    // The popover stays open while the dates are being typed.
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('never applies a partial year while one is typed', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    const from = screen.getByLabelText<HTMLInputElement>('From');
    const to = screen.getByLabelText<HTMLInputElement>('To');
    // A native date input reports the year as it grows: 0002, 0020, 0202, 2026.
    for (const partial of ['0002-10-12', '0020-10-12', '0202-10-12']) {
      fireEvent.change(to, { target: { value: partial } });
      expect(onChange).not.toHaveBeenCalled();
      expect(from.value).toBe('2026-10-01');
    }
    fireEvent.change(to, { target: { value: '2026-10-12' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-12' });
    expect(from.value).toBe('2026-10-01');
  });

  it('reorders a backwards range only on blur or Enter', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    const to = screen.getByLabelText<HTMLInputElement>('To');
    fireEvent.change(to, { target: { value: '2026-09-20' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(to);
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09-20', to: '2026-10-01' });

    const from = screen.getByLabelText<HTMLInputElement>('From');
    fireEvent.change(from, { target: { value: '2026-10-05' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(from, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-05' });
  });

  it('rejects a date before 2000 or after the station today, and reverts it on blur', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(trigger());
    const to = screen.getByLabelText<HTMLInputElement>('To');
    fireEvent.change(to, { target: { value: '2026-10-20' } });
    fireEvent.blur(to);
    const from = screen.getByLabelText<HTMLInputElement>('From');
    fireEvent.change(from, { target: { value: '1999-12-31' } });
    fireEvent.keyDown(from, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(to.value).toBe('2026-10-14');
    expect(from.value).toBe('2026-10-01');
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
    fireEvent.mouseDown(screen.getByLabelText('From'));
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

    const from = screen.getByLabelText<HTMLInputElement>('From');
    const to = screen.getByLabelText<HTMLInputElement>('To');
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
