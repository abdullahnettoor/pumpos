import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DuChip } from './DuChip.js';

describe('DuChip', () => {
  it('exposes the DU name to assistive tech (not inside an aria-hidden node)', () => {
    render(<DuChip name="DU-3" />);
    const chip = screen.getByText('DU-3');
    expect(chip.closest('[aria-hidden="true"]')).toBeNull();
    expect(chip.getAttribute('title')).toBe('DU-3');
  });
});
