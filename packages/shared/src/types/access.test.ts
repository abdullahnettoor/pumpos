import { describe, expect, it } from 'vite-plus/test';
import { UNLIMITED_LIMIT, isUnlimitedLimit, limitUsageText } from './access.js';

// #603: the demo "no limit" sentinel must never print as a number.
describe('Limit display', () => {
  it('reads the sentinel (and anything above it) as unlimited', () => {
    expect(isUnlimitedLimit(UNLIMITED_LIMIT)).toBe(true);
    expect(isUnlimitedLimit(UNLIMITED_LIMIT + 1)).toBe(true);
    expect(isUnlimitedLimit(1000)).toBe(false);
  });

  it('says usage against a real Limit, and "no limit" for the sentinel', () => {
    expect(limitUsageText({ used: 1, value: 3, reached: false })).toBe('1 of 3 used');
    expect(limitUsageText({ used: 3, value: 3, reached: true })).toBe('3 of 3 used (reached)');
    expect(limitUsageText({ used: 1, value: UNLIMITED_LIMIT, reached: false })).toBe(
      '1 used · no limit',
    );
  });
});
