import { describe, expect, it } from 'vitest';
import { deriveMoney, deriveTanks, deriveTiles, tankLevel } from './figures.js';
import { compactRupees, rupees, signedRupees } from './format.js';

describe('rupee formatting', () => {
  it('groups in lakhs and drops paise', () => {
    expect(rupees(218880.4)).toBe('₹2,18,880');
  });
  it('shows negatives with a true minus before the symbol', () => {
    expect(signedRupees(-340)).toBe('−₹340');
    expect(signedRupees(340)).toBe('₹340');
  });
  it('abbreviates only from a lakh up', () => {
    expect(compactRupees(27520)).toBe('₹27,520');
    expect(compactRupees(682400)).toBe('₹6.82L');
    expect(compactRupees(1043200)).toBe('₹10.43L');
    expect(compactRupees(25000000)).toBe('₹2.5Cr');
  });
});

describe('deriveTiles', () => {
  const closed = {
    shifts: [{ shiftSequence: 1, templateName: 'Shift 1' }],
    drawer: {
      totalCashVariance: 0,
      totalAttendantVariance: -340,
      attendants: [
        { attendantName: 'Ramesh K', duName: 'DU1', variance: 0 },
        { attendantName: 'Vinod M', duName: 'DU3', variance: -340 },
      ],
    },
    pnl: { revenue: 212000, cogs: 190500, grossMargin: 21450 },
    credit: { total: 27520, count: 4 },
    purchases: { total: 1043200, count: 1 },
  };

  it('keeps the office and attendant levels apart: value is the office count only', () => {
    const t = deriveTiles(closed);
    expect(t.variance.value).toBe(0);
    expect(t.variance.detail).toBe('1 closed Shift');
    expect(t.variance.secondary).toBe('Attendants −₹340 · DU3 short');
    expect(t.variance.tone).toBe('default');
  });

  it('never adds the attendant variance into the office figure', () => {
    const t = deriveTiles({
      ...closed,
      shifts: [{ shiftSequence: 1, templateName: 'Shift 1', cashVariance: -60 }],
      drawer: { ...closed.drawer, totalCashVariance: -60 },
    });
    expect(t.variance.value).toBe(-60);
    expect(t.variance.detail).toBe('Shift 1 short · office count');
    expect(t.variance.secondary).toBe('Attendants −₹340 · DU3 short');
  });

  it('names the Shift behind a large office variance and counts the others', () => {
    const t = deriveTiles({
      shifts: [
        { shiftSequence: 1, templateName: 'Morning', cashVariance: 20 },
        { shiftSequence: 2, cashVariance: -250 },
        { shiftSequence: 3, cashVariance: 0 },
      ],
      drawer: { totalCashVariance: -230, attendants: [] },
    });
    expect(t.variance).toMatchObject({
      value: -230,
      detail: 'Shift 2 short +1 more · office count',
      tone: 'bad',
    });
    expect(t.variance.secondary).toBeUndefined();
  });

  it('counts the other DUs when several are off, at the attendant level', () => {
    const t = deriveTiles({
      ...closed,
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
    expect(t.variance.secondary).toBe('Attendants −₹90 · DU2 short +1 more');
    expect(t.variance.value).toBe(0);
  });

  it('falls back to "Office count" when the office is off but no Shift row says which', () => {
    const t = deriveTiles({ ...closed, drawer: { totalCashVariance: -150, attendants: [] } });
    expect(t.variance).toMatchObject({ value: -150, detail: 'Office count', tone: 'bad' });
  });

  it('is balanced, or unknown before any Shift has closed', () => {
    expect(deriveTiles({ ...closed, drawer: { totalCashVariance: 0 } }).variance).toMatchObject({
      value: 0,
      detail: '1 closed Shift',
      secondary: undefined,
    });
    const none = deriveTiles({});
    expect(none.variance).toMatchObject({ value: null, detail: 'No closed Shift yet' });
  });

  it('shows margin with its percentage, or asks for product costs', () => {
    expect(deriveTiles(closed).margin).toMatchObject({ value: 21450, detail: '10.1% of sales' });
    const nocost = deriveTiles({ ...closed, pnl: { revenue: 500, cogs: 0, grossMargin: 500 } });
    expect(nocost.margin).toMatchObject({ value: null, detail: 'Set product costs' });
  });

  it('counts credit slips and purchases', () => {
    const t = deriveTiles(closed);
    expect(t.credit).toMatchObject({ value: 27520, detail: '4 slips' });
    expect(t.purchases).toMatchObject({ value: 1043200, detail: '1 purchase' });
  });

  it('falls back when a snapshot has no counts', () => {
    const t = deriveTiles({ credit: { total: 100 }, purchases: { total: 50 } });
    expect(t.credit.detail).toBe('Receivable');
    expect(t.purchases.detail).toBe('Stock received');
  });
});

describe('tank gauges', () => {
  it('turns red below 25% and amber below 40%', () => {
    expect(tankLevel(0)).toBe('red');
    expect(tankLevel(24.9)).toBe('red');
    expect(tankLevel(25)).toBe('amber');
    expect(tankLevel(39.9)).toBe('amber');
    expect(tankLevel(40)).toBe('ok');
    expect(tankLevel(100)).toBe('ok');
  });

  it('derives fill, level and a KL label per tank', () => {
    const [ms, hsd] = deriveTanks([
      {
        id: 't1',
        name: 'Tank 1',
        productName: 'Petrol',
        productCode: 'MS',
        capacity: '20000',
        currentVolume: '12400',
        productUnit: 'L',
      },
      {
        id: 't2',
        name: 'Tank 2',
        productName: 'Diesel',
        productCode: 'HSD',
        capacity: '20000',
        currentVolume: 3600,
        productUnit: 'Litre',
      },
    ]);
    expect(ms).toMatchObject({ title: 'MS', pct: 62, fill: 62, level: 'ok', volume: '12.4 KL' });
    expect(hsd).toMatchObject({ title: 'HSD', pct: 18, level: 'red', volume: '3.6 KL' });
  });

  it('keeps the tube within bounds when book stock is over capacity', () => {
    const [t] = deriveTanks([
      { id: 't', name: 'T', productName: 'P', capacity: 1000, currentVolume: 1200 },
    ]);
    expect(t).toMatchObject({ pct: 120, fill: 100, title: 'P' });
  });

  it('has no gauge for a tank without a capacity, and never goes negative', () => {
    const [a, b] = deriveTanks([
      { id: 'a', name: 'A', productName: 'P', capacity: 0, currentVolume: 500 },
      { id: 'b', name: 'B', productName: 'P', capacity: 1000, currentVolume: -50 },
    ]);
    expect(a).toMatchObject({ pct: null, fill: 0, level: 'unknown' });
    expect(b).toMatchObject({ pct: 0, fill: 0, level: 'red' });
  });

  it('shows non-litre stock in its own unit', () => {
    const [t] = deriveTanks([
      {
        id: 'c',
        name: 'CNG',
        productName: 'CNG',
        capacity: 500,
        currentVolume: 250,
        productUnit: 'kg',
      },
    ]);
    expect(t.volume).toBe('250 kg');
  });
});

describe('deriveMoney', () => {
  it('sums only positive dues and counts the parties', () => {
    const m = deriveMoney(
      [
        { currentBalance: '1000' },
        { currentBalance: 250.5 },
        { currentBalance: -300 },
        { currentBalance: 0 },
      ],
      [{ currentBalance: 700 }, { currentBalance: 0 }],
    );
    expect(m.toCollect).toEqual({ value: 1250.5, parties: 2, detail: '2 customers with dues' });
    expect(m.toPay).toEqual({ value: 700, parties: 1, detail: '1 supplier to pay' });
  });

  it('says nothing is due when nothing is', () => {
    const m = deriveMoney([], undefined);
    expect(m.toCollect.detail).toBe('Nothing due');
    expect(m.toPay.detail).toBe('Nothing to pay');
  });
});
