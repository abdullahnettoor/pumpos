import { describe, it, expect } from 'vitest';
import {
  formatShiftLabel,
  deriveShiftSequences,
  shiftLabelFrom,
  shiftDisplayLabel,
} from './shift-label.js';

const shift = (id: string, openedAt: string | null) => ({ id, openedAt });

describe('formatShiftLabel', () => {
  it('renders YYYYMMDD-N', () => {
    expect(formatShiftLabel('2026-09-17', 2)).toBe('20260917-2');
  });

  it('returns null rather than a half-formed label', () => {
    expect(formatShiftLabel(null, 1)).toBeNull();
    expect(formatShiftLabel('2026-09-17', 0)).toBeNull();
    expect(formatShiftLabel('2026-09-17', null)).toBeNull();
    expect(formatShiftLabel('not-a-date', 1)).toBeNull();
  });
});

describe('deriveShiftSequences', () => {
  it('numbers a day by opened-at, not by input order', () => {
    const seq = deriveShiftSequences([
      shift('c', '2026-09-17T22:00:00Z'),
      shift('a', '2026-09-17T06:00:00Z'),
      shift('b', '2026-09-17T14:00:00Z'),
    ]);
    expect([...seq]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
  });

  it('breaks opened-at ties on id so the order is total', () => {
    const seq = deriveShiftSequences([
      shift('z', '2026-09-17T06:00:00Z'),
      shift('y', '2026-09-17T06:00:00Z'),
    ]);
    expect(seq.get('y')).toBe(1);
    expect(seq.get('z')).toBe(2);
  });

  it('accepts Date as well as ISO strings', () => {
    const seq = deriveShiftSequences([
      { id: 'b', openedAt: new Date('2026-09-17T14:00:00Z') },
      { id: 'a', openedAt: new Date('2026-09-17T06:00:00Z') },
    ]);
    expect(seq.get('a')).toBe(1);
    expect(seq.get('b')).toBe(2);
  });

  it('keeps a voided shift in its slot so later shifts never renumber', () => {
    const day = [
      shift('a', '2026-09-17T06:00:00Z'),
      shift('voided', '2026-09-17T14:00:00Z'),
      shift('c', '2026-09-17T22:00:00Z'),
    ];
    expect(deriveShiftSequences(day).get('c')).toBe(3);
    // Same day re-read after the middle shift is voided — it is still counted.
    expect(deriveShiftSequences([...day]).get('c')).toBe(3);
    // Dropping it, which this helper must never do, is what would renumber.
    expect(deriveShiftSequences(day.filter((s) => s.id !== 'voided')).get('c')).toBe(2);
  });
});

describe('shiftLabelFrom', () => {
  it('resets numbering each business day', () => {
    const dayOne = [shift('a', '2026-09-17T06:00:00Z'), shift('b', '2026-09-17T18:00:00Z')];
    const dayTwo = [shift('c', '2026-09-18T06:00:00Z')];
    expect(shiftLabelFrom('2026-09-17', 'b', dayOne)).toBe('20260917-2');
    expect(shiftLabelFrom('2026-09-18', 'c', dayTwo)).toBe('20260918-1');
  });

  it('returns null for a shift outside the given day', () => {
    expect(
      shiftLabelFrom('2026-09-17', 'missing', [shift('a', '2026-09-17T06:00:00Z')]),
    ).toBeNull();
  });
});

describe('shiftDisplayLabel', () => {
  it('prints the label when the read carries a date and a sequence', () => {
    expect(
      shiftDisplayLabel({ businessDate: '2026-09-17', shiftSequence: 2, shiftId: 'abcdef12-...' }),
    ).toBe('20260917-2');
  });

  it('falls back to a uuid fragment for pre-#228 snapshots', () => {
    expect(shiftDisplayLabel({ shiftId: '8f6c3d04-1111-2222-3333-444444444444' })).toBe(
      '8f6c3d04\u2026',
    );
  });

  it('prints an em dash when there is nothing to name the shift by', () => {
    expect(shiftDisplayLabel({})).toBe('—');
  });
});
