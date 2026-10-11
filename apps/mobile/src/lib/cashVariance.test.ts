import { describe, expect, it } from 'vitest';
import { dayCashVariance, shiftCashVariance } from './cashVariance.js';
import { deriveShiftVariance } from './shifts/variance.js';

const brief = (c: ReturnType<typeof dayCashVariance>) =>
  c.levels.map((l) => [l.label, l.text, l.note, l.tone]);

describe('dayCashVariance (Home and DSSR tile)', () => {
  const day = {
    shifts: [
      { shiftSequence: 1, templateName: 'Morning', cashVariance: 50 },
      { shiftSequence: 2, templateName: 'Evening', cashVariance: 0 },
    ],
    drawer: {
      totalCashVariance: 50,
      totalAttendantVariance: -125,
      attendants: [
        { attendantName: 'Ramesh Kumar', duName: 'DU-1', variance: -125 },
        { attendantName: 'Suresh Patil', duName: 'DU-2', variance: 0 },
      ],
    },
  };

  it('fixture day: Attendants −₹125 · DU-1 short beside Office count +₹50, never summed', () => {
    const c = dayCashVariance(day);
    expect(brief(c)).toEqual([
      ['Attendants', '−₹125', 'DU-1 short', 'bad'],
      ['Office count', '+₹50', 'Morning over', 'warn'],
    ]);
    // −125 + 50 = −75 appears nowhere.
    expect(c.levels.map((l) => l.value)).toEqual([-125, 50]);
  });

  it('the tile tone is the worst of the two levels', () => {
    expect(dayCashVariance(day).tone).toBe('bad');
    const officeOnlyOver = {
      ...day,
      drawer: { ...day.drawer, totalAttendantVariance: 0, attendants: [] },
    };
    expect(dayCashVariance(officeOnlyOver).tone).toBe('warn');
    const balanced = {
      shifts: [{ shiftSequence: 1, cashVariance: 0 }],
      drawer: { totalCashVariance: 0, totalAttendantVariance: 0, attendants: [] },
    };
    const c = dayCashVariance(balanced);
    expect(brief(c)).toEqual([
      ['Attendants', '₹0', 'Balanced', 'good'],
      ['Office count', '₹0', '1 closed Shift', 'good'],
    ]);
    expect(c.tone).toBe('good');
  });

  it('names the Shift behind an office variance and counts the others', () => {
    const c = dayCashVariance({
      shifts: [
        { shiftSequence: 1, templateName: 'Morning', cashVariance: 20 },
        { shiftSequence: 2, cashVariance: -250 },
        { shiftSequence: 3, cashVariance: 0 },
      ],
      drawer: { totalCashVariance: -230, totalAttendantVariance: 0, attendants: [] },
    });
    expect(c.levels[1]).toMatchObject({
      text: '−₹230',
      note: 'Shift 2 short +1 more',
      tone: 'bad',
    });
  });

  it('counts the other DUs when several are off', () => {
    const c = dayCashVariance({
      ...day,
      drawer: {
        totalCashVariance: 0,
        totalAttendantVariance: -90,
        attendants: [
          { duName: 'DU1', variance: 20 },
          { duName: 'DU2', variance: -110 },
          { duName: 'DU3', variance: 0 },
        ],
      },
    });
    expect(c.levels[0]).toMatchObject({ text: '−₹90', note: 'DU2 short +1 more' });
  });

  it('falls back to Short / Over when no row says whose it is', () => {
    const c = dayCashVariance({
      shifts: [{ shiftSequence: 1, cashVariance: 0 }],
      drawer: { totalCashVariance: -150, totalAttendantVariance: 40, attendants: [] },
    });
    expect(brief(c)).toEqual([
      ['Attendants', '+₹40', 'Over', 'warn'],
      ['Office count', '−₹150', 'Short', 'bad'],
    ]);
  });

  it('shows the office figure alone for a day with no attendant level', () => {
    const c = dayCashVariance({
      shifts: [{ shiftSequence: 1, cashVariance: -60 }],
      drawer: { totalCashVariance: -60, attendants: [] },
    });
    expect(c.levels).toHaveLength(1);
    expect(c.levels[0]).toMatchObject({ key: 'single', value: -60, tone: 'bad' });
  });

  it('is empty before any Shift has closed', () => {
    expect(dayCashVariance({})).toEqual({ levels: [], tone: 'good', empty: 'No closed Shift yet' });
  });

  it('shows a variance under ₹1 exactly rather than as ₹0', () => {
    const c = dayCashVariance({
      shifts: [{ shiftSequence: 1, cashVariance: 0.5 }],
      drawer: { totalCashVariance: 0.5, totalAttendantVariance: 0, attendants: [] },
    });
    expect(c.levels[1].text).not.toBe('₹0');
  });
});

describe('shiftCashVariance (Shift Summary header)', () => {
  const morning = {
    cashVarianceModel: 2,
    attendantVariance: -125,
    officeCountVariance: 50,
    cashVariance: 50,
    drawers: [
      { attendantId: 'a1', duName: 'DU-1', variance: -125 },
      { attendantId: 'a2', duName: 'DU-2', variance: 0 },
    ],
  };

  it('Morning: the same two figures the day tile shows', () => {
    const c = shiftCashVariance(deriveShiftVariance(morning));
    expect(brief(c)).toEqual([
      ['Attendants', '−₹125', 'DU-1 short', 'bad'],
      ['Office count', '+₹50', 'Over', 'warn'],
    ]);
    expect(c.tone).toBe('bad');
  });

  it('Evening: both balanced', () => {
    const c = shiftCashVariance(
      deriveShiftVariance({
        cashVarianceModel: 2,
        attendantVariance: 0,
        officeCountVariance: 0,
        cashVariance: 0,
        drawers: [],
      }),
    );
    expect(brief(c)).toEqual([
      ['Attendants', '₹0', 'Balanced', 'good'],
      ['Office count', '₹0', 'Balanced', 'good'],
    ]);
    expect(c.tone).toBe('good');
  });

  it('a single-level snapshot has one combined figure', () => {
    const c = shiftCashVariance(deriveShiftVariance({ cashVariance: -80, drawers: [] }));
    expect(c.levels).toHaveLength(1);
    expect(c.levels[0]).toMatchObject({ key: 'single', value: -80, note: 'Short', tone: 'bad' });
  });
});
