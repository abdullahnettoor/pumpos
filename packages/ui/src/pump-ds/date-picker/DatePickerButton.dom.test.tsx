// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatePickerButton } from './DatePickerButton.js';

afterEach(cleanup);

const trigger = () => screen.getByRole('button', { name: /^DSR date:/ });

describe('DatePickerButton (#603)', () => {
  it('reads the day unambiguously, never as 11/10/2026', () => {
    render(<DatePickerButton aria-label="DSR date" value="2026-10-11" onChange={() => {}} />);
    expect(trigger().textContent).toBe('Sun 11 Oct 2026');
    expect(trigger().getAttribute('aria-label')).toBe('DSR date: Sun 11 Oct 2026');
    expect(document.querySelector('input[type=date]')).toBeNull();
  });

  it('opens a calendar on the chosen month and picks a day at once', () => {
    const onChange = vi.fn();
    render(
      <DatePickerButton
        aria-label="DSR date"
        value="2026-10-11"
        max="2026-10-15"
        onChange={onChange}
      />,
    );
    fireEvent.click(trigger());
    const grid = screen.getByRole('grid', { name: 'October 2026' });
    expect(grid).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fri 16 Oct 2026' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Next month' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mon 5 Oct 2026' }));
    expect(onChange).toHaveBeenCalledWith('2026-10-05');
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('moves with the arrow keys, picks with Enter and closes on Escape', () => {
    const Harness = () => {
      const [d, setD] = useState('2026-10-11');
      return <DatePickerButton aria-label="DSR date" value={d} onChange={setD} />;
    };
    render(<Harness />);
    fireEvent.click(trigger());
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-10-04');
    fireEvent.keyDown(grid, { key: 'PageUp' });
    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeTruthy();
    fireEvent.click(document.activeElement as HTMLElement);
    expect(trigger().textContent).toBe('Fri 4 Sep 2026');
    fireEvent.click(trigger());
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('asks for a date when none is chosen', () => {
    render(
      <DatePickerButton aria-label="DSR date" value="" max="2026-10-15" onChange={() => {}} />,
    );
    expect(trigger().textContent).toBe('Choose a date');
    fireEvent.click(trigger());
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeTruthy();
  });
});
