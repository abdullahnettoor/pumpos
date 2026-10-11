import { describe, expect, it } from 'vitest';
import { ageInDays } from './age.js';

describe('ageInDays', () => {
  it('counts whole calendar days, across a month end', () => {
    expect(ageInDays('2026-10-09', '2026-10-09')).toBe(0);
    expect(ageInDays('2026-09-28', '2026-10-02')).toBe(4);
  });

  it('never goes below zero when the clock is behind the entry', () => {
    expect(ageInDays('2026-10-12', '2026-10-09')).toBe(0);
  });
});
