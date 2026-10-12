import { describe, expect, it } from 'vitest';
import { boardColumnsFor, boardTemplateFor } from './boardLayout.js';

describe('boardColumnsFor', () => {
  it.each([
    [0, 3],
    [1400, 3],
    [1120, 3],
    [1119, 2],
    [760, 2],
    [759, 1],
    [320, 1],
  ])('width %i → %i columns', (w, cols) => {
    expect(boardColumnsFor(w)).toBe(cols);
  });

  it('medium: Fuels spans the right, Money under Forecourt', () => {
    expect(boardTemplateFor(2).areas).toBe('"forecourt fuels" "money fuels"');
    expect(boardTemplateFor(3).columns).toBe('1.15fr 1fr 1fr');
  });
});
