import { describe, expect, it } from 'vitest';
import type { BusinessDayListItem, BusinessDayListWeek } from '@pump/shared';
import {
  DAY_STATUS,
  barWidths,
  dayParts,
  dayView,
  draftDates,
  liveTabFor,
  monthLabel,
  weekChange,
  weekTile,
} from './days.js';

const d = (businessDate: string, totalSales: number, status = 'SEALED') =>
  ({ businessDate, totalSales, status }) as never;

const item = (over: Partial<BusinessDayListItem> = {}): BusinessDayListItem => ({
  businessDate: '2026-10-08',
  status: 'SEALED',
  totalSales: 466000,
  fuelSales: 460000,
  productSales: 6000,
  volume: 4752.4,
  cashVariance: 0,
  shiftCount: 2,
  ...over,
});

describe('reports day helpers', () => {
  it('derives weekday and day from the Business Date', () => {
    expect(dayParts('2026-10-09')).toEqual({ weekday: 'Fri', day: 9 });
    expect(dayParts('2026-03-01')).toEqual({ weekday: 'Sun', day: 1 });
  });
  it('labels months', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
  });
  it('computes week change, hiding it without a prior week', () => {
    expect(weekChange(106.4, 100)).toBe(6.4);
    expect(weekChange(90, 100)).toBe(-10);
    expect(weekChange(50, 0)).toBeNull();
  });
  it('lists draft dates', () => {
    expect(draftDates([d('a', 1, 'LIVE'), d('b', 1, 'DRAFT'), d('c', 1, 'SEALED')])).toEqual(['b']);
  });
});

describe('barWidths', () => {
  it('scales bars to the largest figure passed in, so months share one scale', () => {
    const october = [d('a', 250), d('b', 125)];
    const september = [d('c', 500)];
    expect(barWidths([...october, ...september])).toEqual([50, 25, 100]);
    // The same October rows alone would have been rescaled to their own maximum.
    expect(barWidths(october)).toEqual([100, 50]);
  });
  it('puts Live and Report-missing rows on no scale and keeps them out of the maximum', () => {
    expect(
      barWidths([d('a', 900, 'LIVE'), d('b', 400, 'DRAFT'), d('c', 0, 'REPORT_MISSING')]),
    ).toEqual([0, 100, 0]);
  });
  it('handles empty and all-zero input', () => {
    expect(barWidths([d('a', 0)])).toEqual([0]);
    expect(barWidths([])).toEqual([]);
  });
});

describe('DAY_STATUS', () => {
  it('has one presentation per status, and only Report missing does not open', () => {
    expect(DAY_STATUS.LIVE).toMatchObject({ label: 'Live', tone: 'good', action: 'live' });
    expect(DAY_STATUS.DRAFT).toMatchObject({ label: 'Draft', tone: 'warn', action: 'report' });
    expect(DAY_STATUS.SEALED).toMatchObject({ label: 'Sealed', tone: 'muted', action: 'report' });
    expect(DAY_STATUS.REPORT_MISSING).toMatchObject({
      label: 'Report missing',
      tone: 'bad',
      action: 'none',
    });
  });
});

describe('dayView', () => {
  it('shows a Sealed day with sales, litres, a balanced cash note and the full spoken figures', () => {
    expect(dayView(item(), 'home')).toMatchObject({
      weekday: 'Thu',
      dayOfMonth: 8,
      statusLabel: 'Sealed',
      headline: '₹4.66L',
      bar: 'scaled',
      volume: '4,752 L',
      note: 'Cash balanced',
      noteTone: 'plain',
      action: 'report',
      label: 'Thu 8 Oct, Sealed, ₹4.66L, 4,752 L, Cash balanced',
    });
  });
  it('flags a short or over cash variance with its sign and tone', () => {
    expect(dayView(item({ cashVariance: -1250 }), 'home')).toMatchObject({
      note: 'Cash −₹1,250',
      noteTone: 'bad',
    });
    expect(dayView(item({ cashVariance: 120 }), 'home')).toMatchObject({
      note: 'Cash +₹120',
      noteTone: 'warn',
    });
  });
  it('shows a dash for litres when no Shift has closed', () => {
    expect(dayView(item({ status: 'DRAFT', shiftCount: 0, volume: 0 }), 'home').volume).toBe('—');
  });
  it('shows a Live day as In progress with no figure, pointing to Home', () => {
    const v = dayView(item({ status: 'LIVE', totalSales: 21500, volume: 900 }), 'home');
    expect(v).toMatchObject({
      headline: 'In progress',
      volume: '—',
      note: 'See Home',
      bar: 'hatched',
      action: 'live',
      liveTab: 'home',
      label: 'Thu 8 Oct, Live, In progress, See Home',
    });
    expect(v.label).not.toContain('21');
  });
  it('points a Role without Home (a Manager) at Shifts', () => {
    const v = dayView(item({ status: 'LIVE' }), 'shifts');
    expect(v).toMatchObject({ action: 'live', liveTab: 'shifts', note: 'See Shifts' });
  });
  it('shows a Live day as Day in progress, not tappable, for a Role with neither tab', () => {
    const v = dayView(item({ status: 'LIVE' }), null);
    expect(v).toMatchObject({
      headline: 'Day in progress',
      action: 'none',
      liveTab: null,
      note: 'No report until it closes',
    });
  });
  it('shows a closed day without a DSSR snapshot honestly and does not open it', () => {
    const v = dayView(item({ status: 'REPORT_MISSING', totalSales: 0, shiftCount: 0 }), null);
    expect(v).toMatchObject({
      statusLabel: 'Report missing',
      tone: 'bad',
      headline: 'Closed',
      note: 'No DSSR for this day',
      bar: 'none',
      volume: '—',
      action: 'none',
      label: 'Thu 8 Oct, Report missing, Closed, No DSSR for this day',
    });
  });
});

const week = (over: Partial<BusinessDayListWeek> = {}): BusinessDayListWeek => ({
  total: 3196000,
  sealedDays: 7,
  comparison: { total: 3196000, previousTotal: 3003000, days: 7 },
  openPastDays: 0,
  ...over,
});

describe('weekTile', () => {
  it('shows the Sealed total and the like-for-like change', () => {
    expect(weekTile(week())).toEqual({
      value: '₹31.96L',
      text: '6.4% vs previous 7',
      arrow: '▲',
      srDirection: 'Up',
    });
  });
  it('states the coverage when fewer than 7 days could be compared', () => {
    const tile = weekTile(week({ comparison: { total: 900, previousTotal: 1000, days: 4 } }));
    expect(tile).toMatchObject({
      text: '10% vs previous 7 · 4 days compared',
      arrow: '▼',
      srDirection: 'Down',
    });
  });
  it('says so when nothing can be compared', () => {
    const none = { total: 0, previousTotal: 0, days: 0 };
    expect(weekTile(week({ comparison: none })).text).toBe('Nothing to compare yet');
    expect(weekTile(week({ sealedDays: 0, total: 0, comparison: none })).text).toBe(
      'No sealed days yet',
    );
    expect(weekTile(week({ comparison: none })).arrow).toBeNull();
  });
});

describe('liveTabFor', () => {
  it('prefers Home, falls back to Shifts, else nothing', () => {
    expect(liveTabFor(['home', 'shifts', 'reports'])).toBe('home');
    expect(liveTabFor(['shifts', 'reports', 'money'])).toBe('shifts');
    expect(liveTabFor(['reports', 'money'])).toBeNull();
  });
});
