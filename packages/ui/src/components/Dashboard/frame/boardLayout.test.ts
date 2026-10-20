import { describe, expect, it } from 'vite-plus/test';
import { boardColumnsFor, boardTemplateFor } from './boardLayout.js';

describe('boardColumnsFor', () => {
  it.each([
    [0, 3],
    [1400, 3],
    [1098, 3], // 1366px window − 220px sidebar − 48px padding
    [1072, 3],
    [1071, 2],
    [712, 2],
    [711, 1],
    [320, 1],
  ])('width %i → %i columns', (w, cols) => {
    expect(boardColumnsFor(w)).toBe(cols);
  });

  it('medium: Fuels spans the right, Money under Forecourt', () => {
    expect(boardTemplateFor(2).areas).toBe('"forecourt fuels" "money fuels"');
    expect(boardTemplateFor(3).columns).toBe('1.15fr 1fr 1fr');
  });
});
