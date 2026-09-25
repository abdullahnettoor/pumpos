import { describe, expect, it } from 'vitest';
import { DEFAULT_SHIFT_SUMMARY_CONFIG, resolveSections } from './reportConfig.js';

describe('resolveSections', () => {
  const defaults = DEFAULT_SHIFT_SUMMARY_CONFIG.sections;

  it("drops keys that no longer exist, such as the retired 'purchases' (#308)", () => {
    expect(resolveSections(['meta', 'purchases', 'signatures'], defaults)).toEqual([
      'meta',
      'signatures',
    ]);
  });

  it('keeps the saved order', () => {
    expect(resolveSections(['signatures', 'meta'], defaults)).toEqual(['signatures', 'meta']);
  });

  it.each([
    ['nothing saved', undefined],
    ['an empty list', []],
    ['only unknown keys', ['purchases']],
  ])('falls back to the defaults for %s', (_label, saved) => {
    expect(resolveSections(saved, defaults)).toEqual([...defaults]);
  });
});
