import { describe, expect, it } from 'vitest';
import { densityChangeExceedsTolerance, isUnexplainedDensityJump } from './density-form.js';

describe('densityChangeExceedsTolerance', () => {
  it('judges the change as shown, to one decimal', () => {
    expect(densityChangeExceedsTolerance(3.04, 3)).toBe(false);
    expect(densityChangeExceedsTolerance(3.06, 3)).toBe(true);
    expect(densityChangeExceedsTolerance(-3.06, 3)).toBe(true);
    expect(densityChangeExceedsTolerance(3, 3)).toBe(false);
  });

  it('rounds the magnitude, so a rise and a fall of the same size read alike (±3.05 ties)', () => {
    expect(densityChangeExceedsTolerance(3.05, 3)).toBe(true);
    expect(densityChangeExceedsTolerance(-3.05, 3)).toBe(true);
    expect(densityChangeExceedsTolerance(3.04, 3)).toBe(false);
    expect(densityChangeExceedsTolerance(-3.04, 3)).toBe(false);
  });
});

describe('isUnexplainedDensityJump', () => {
  it('uses the same rounded rule', () => {
    expect(isUnexplainedDensityJump({ delta: 3.04, kind: 'ADHOC', tolerance: 3 })).toBe(false);
    expect(isUnexplainedDensityJump({ delta: 3.06, kind: 'ADHOC', tolerance: 3 })).toBe(true);
  });

  it('a Decantation explains a large change; a server flag is always a jump', () => {
    expect(isUnexplainedDensityJump({ delta: 6, kind: 'DECANTATION', tolerance: 3 })).toBe(false);
    expect(
      isUnexplainedDensityJump({
        delta: 0.1,
        kind: 'ADHOC',
        flags: ['UNEXPLAINED_JUMP'],
        tolerance: 3,
      }),
    ).toBe(true);
  });
});
