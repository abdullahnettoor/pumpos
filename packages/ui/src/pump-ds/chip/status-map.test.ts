import { describe, expect, it } from 'vitest';
import { statusPresentation } from '@pump/shared';
import { STATUS_MAP, type PumpStatus } from './status-map.js';

describe('STATUS_MAP (#518)', () => {
  it('gives no word two colours', () => {
    const toneOf = new Map<string, Set<string>>();
    for (const meta of Object.values(STATUS_MAP)) {
      const tones = toneOf.get(meta.label) ?? new Set<string>();
      tones.add(meta.tone);
      toneOf.set(meta.label, tones);
    }
    const clashes = [...toneOf].filter(([, tones]) => tones.size > 1).map(([label]) => label);
    expect(clashes).toEqual([]);
  });

  it.each([
    ['draft', 'day-draft'],
    ['shortage', 'short'],
    ['excess', 'surplus'],
    ['closed', 'shift-closed'],
  ] as const)('legacy %s reads as %s', (legacy, state) => {
    const { label, tone } = statusPresentation(state);
    expect(STATUS_MAP[legacy as PumpStatus]).toMatchObject({ label, tone });
  });
});
