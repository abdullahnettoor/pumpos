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
});
