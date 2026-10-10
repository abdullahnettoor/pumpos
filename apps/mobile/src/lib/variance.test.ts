import { describe, expect, it } from 'vitest';
import { varianceTone } from './variance.js';

describe('varianceTone', () => {
  it('walks the ladder: short is bad, over is warn, level is good', () => {
    expect(varianceTone(-210)).toBe('bad');
    expect(varianceTone(1590)).toBe('warn');
    expect(varianceTone(0)).toBe('good');
  });
  it('treats a sub-rupee residue as level', () => {
    expect(varianceTone(0.5)).toBe('good');
    expect(varianceTone(-0.5)).toBe('good');
    expect(varianceTone(0.51)).toBe('warn');
    expect(varianceTone(-0.51)).toBe('bad');
  });
});
