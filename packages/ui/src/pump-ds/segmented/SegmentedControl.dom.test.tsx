// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl.js';

afterEach(cleanup);

const options = [
  { value: 'A4', label: 'A4' },
  { value: 'LETTER', label: 'Letter' },
] as const;

describe('SegmentedControl', () => {
  it('marks the selected segment and reports a new choice', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl aria-label="Paper" options={options} value="A4" onChange={onChange} />,
    );
    expect(screen.getByRole('radio', { name: 'A4' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Letter' }));
    expect(onChange).toHaveBeenCalledWith('LETTER');
  });

  it('does not report a click on the segment already selected', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl aria-label="Paper" options={options} value="A4" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'A4' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stretch gives every segment an equal share of the row', () => {
    render(
      <SegmentedControl
        aria-label="Paper"
        options={options}
        value="A4"
        onChange={() => {}}
        stretch
        activeStyle="brand"
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Paper' });
    expect(group.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(screen.getByRole('radio', { name: 'A4' }).className).toContain('bg-brand');
  });

  describe('keyboard', () => {
    const three = [
      { value: 'a', label: 'One' },
      { value: 'b', label: 'Two' },
      { value: 'c', label: 'Three' },
    ] as const;

    it('puts only the selected segment in the tab order', () => {
      render(<SegmentedControl aria-label="N" options={three} value="b" onChange={() => {}} />);
      expect(screen.getByRole('radio', { name: 'One' }).tabIndex).toBe(-1);
      expect(screen.getByRole('radio', { name: 'Two' }).tabIndex).toBe(0);
      expect(screen.getByRole('radio', { name: 'Three' }).tabIndex).toBe(-1);
    });

    it('moves and selects with the arrow keys, wrapping at the ends', () => {
      const onChange = vi.fn();
      render(<SegmentedControl aria-label="N" options={three} value="c" onChange={onChange} />);
      const group = screen.getByRole('radiogroup', { name: 'N' });
      fireEvent.keyDown(group, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenLastCalledWith('a');
      fireEvent.keyDown(group, { key: 'ArrowLeft' });
      expect(onChange).toHaveBeenLastCalledWith('b');
      fireEvent.keyDown(group, { key: 'Home' });
      expect(onChange).toHaveBeenLastCalledWith('a');
      fireEvent.keyDown(group, { key: 'End' });
      expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('with nothing selected, ArrowLeft goes to the last segment and ArrowRight to the first', () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          aria-label="N"
          options={three}
          value={'' as 'a'}
          onChange={onChange}
        />,
      );
      const group = screen.getByRole('radiogroup', { name: 'N' });
      fireEvent.keyDown(group, { key: 'ArrowLeft' });
      expect(onChange).toHaveBeenLastCalledWith('c');
      fireEvent.keyDown(group, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenLastCalledWith('a');
    });

    it('manual activation: the arrows only move the focus; a click (Enter / Space) chooses', () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          aria-label="N"
          options={three}
          value="a"
          onChange={onChange}
          activation="manual"
        />,
      );
      const group = screen.getByRole('radiogroup', { name: 'N' });
      screen.getByRole('radio', { name: 'One' }).focus();
      fireEvent.keyDown(group, { key: 'ArrowRight' });
      expect(onChange).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Two' }));
      fireEvent.keyDown(group, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Three' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Three' }));
      expect(onChange).toHaveBeenCalledWith('c');
    });

    it('follows the arrows down a vertical group and keeps the focus with the choice', () => {
      const onChange = vi.fn();
      render(
        <SegmentedControl
          aria-label="N"
          options={three}
          value="a"
          onChange={onChange}
          orientation="vertical"
        />,
      );
      const group = screen.getByRole('radiogroup', { name: 'N' });
      expect(group.getAttribute('aria-orientation')).toBe('vertical');
      fireEvent.keyDown(group, { key: 'ArrowDown' });
      expect(onChange).toHaveBeenCalledWith('b');
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Two' }));
    });

    it('ignores other keys and a disabled group', () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <SegmentedControl aria-label="N" options={three} value="a" onChange={onChange} />,
      );
      fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'Enter' });
      rerender(
        <SegmentedControl aria-label="N" options={three} value="a" onChange={onChange} disabled />,
      );
      fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
