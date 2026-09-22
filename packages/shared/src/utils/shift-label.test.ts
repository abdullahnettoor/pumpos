import { describe, it, expect } from 'vitest';
import { formatShiftLabel, deriveShiftSequences, shiftDisplayLabel } from './shift-label.js';

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

  // Ties must break the way Postgres orders `uuid` — raw bytes, i.e. codepoint
  // order over the canonical hex form. `localeCompare` ignores the hyphens and
  // puts these the other way round, which would make a client-derived label
  // disagree with the one the API projects.
  it('orders tied ids the way Postgres orders uuids, not by collation', () => {
    const at = '2026-09-17T06:00:00Z';
    const seq = deriveShiftSequences([
      shift('00000000-0000-0000-0000-0000000000b0', at),
      shift('00000000-0000-0000-0000-00000000000a', at),
    ]);
    expect(seq.get('00000000-0000-0000-0000-00000000000a')).toBe(1);
    expect(seq.get('00000000-0000-0000-0000-0000000000b0')).toBe(2);
  });

  it('accepts Date as well as ISO strings', () => {
    const seq = deriveShiftSequences([
      { id: 'b', openedAt: new Date('2026-09-17T14:00:00Z') },
      { id: 'a', openedAt: new Date('2026-09-17T06:00:00Z') },
    ]);
    expect(seq.get('a')).toBe(1);
    expect(seq.get('b')).toBe(2);
  });

  // The label's whole value is that it does not change. A voided shift must
  // keep its slot: the third shift of the day stays `-3` even once the second
  // is written off, or a statement printed yesterday names a different shift
  // today. Sequencing over the day's surviving shifts is the mistake this
  // pins — it is off by one for every shift after the voided one.
  it('keeps a voided shift in its slot so later shifts never renumber', () => {
    const wholeDay = [
      shift('a', '2026-09-17T06:00:00Z'),
      shift('voided', '2026-09-17T14:00:00Z'),
      shift('c', '2026-09-17T22:00:00Z'),
    ];
    const surviving = wholeDay.filter((s) => s.id !== 'voided');
    expect(deriveShiftSequences(wholeDay).get('c')).toBe(3);
    expect(deriveShiftSequences(surviving).get('c')).toBe(2);
  });
});

describe('numbering resets each business day', () => {
  it('starts the next day at 1, however many shifts the previous day had', () => {
    const dayOne = [shift('a', '2026-09-17T06:00:00Z'), shift('b', '2026-09-17T18:00:00Z')];
    const dayTwo = [shift('c', '2026-09-18T06:00:00Z')];
    const label = (date: string, id: string, day: typeof dayOne) =>
      formatShiftLabel(date, deriveShiftSequences(day).get(id));
    expect(label('2026-09-17', 'b', dayOne)).toBe('20260917-2');
    expect(label('2026-09-18', 'c', dayTwo)).toBe('20260918-1');
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
