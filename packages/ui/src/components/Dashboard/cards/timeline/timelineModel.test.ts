import { describe, expect, it } from 'vitest';
import {
  buildBars,
  buildCarryBar,
  deriveCarryOver,
  hourTicks,
  openingChips,
  scheduleSegments,
  type ShiftBarInput,
} from './timelineModel.js';

const MIN = 60_000;
const tl = { dayStartAt: Date.UTC(2026, 9, 12, 0, 30), dayEndAt: Date.UTC(2026, 9, 13, 0, 30) }; // 6 am IST
const tpl = (id: string, startTime: string, endTime: string, isActive = true) => ({
  id,
  name: id,
  startTime,
  endTime,
  isActive,
});

describe('scheduleSegments', () => {
  it('orders active windows from the Day Start and labels them', () => {
    const segs = scheduleSegments(
      [tpl('b', '14:00', '22:00'), tpl('a', '06:00', '14:00'), tpl('x', '01:00', '02:00', false)],
      tl,
      '06:00',
    );
    expect(segs.map((s) => [s.templateId, s.leftPct, s.widthPct, s.label])).toEqual([
      ['a', 0, (480 / 1440) * 100, 'Shift 1 · 6:00 am–2:00 pm'],
      ['b', (480 / 1440) * 100, (480 / 1440) * 100, 'Shift 2 · 2:00 pm–10:00 pm'],
    ]);
  });

  it('keeps a 22:00–06:00 window inside the axis when the Day Start is 06:00', () => {
    const [s] = scheduleSegments([tpl('n', '22:00', '06:00')], tl, '06:00');
    expect(s.leftPct).toBeCloseTo((960 / 1440) * 100);
    expect(s.leftPct + s.widthPct).toBeCloseTo(100);
  });

  it('wraps a window that crosses the Day Start', () => {
    const segs = scheduleSegments([tpl('w', '04:00', '10:00')], tl, '06:00');
    expect(segs).toHaveLength(2);
    expect(segs[0].leftPct + segs[0].widthPct).toBeCloseTo(100);
    expect(segs[1]).toMatchObject({ leftPct: 0, label: null });
    expect(segs[1].widthPct).toBeCloseTo((240 / 1440) * 100);
  });
});

describe('openingChips', () => {
  const sched = tl.dayStartAt;
  const shift = (openedAfterMin: number): ShiftBarInput => ({
    id: 's',
    name: 'Shift',
    sequence: 1,
    openedAt: new Date(sched + openedAfterMin * MIN).toISOString(),
    closedAt: null,
    total: null,
    variance: null,
    scheduledStartAt: sched,
  });
  const chip = (m: number) => openingChips([shift(m)], tl, 'Asia/Kolkata')[0];

  it('is success within the tolerance', () => {
    expect(chip(12)).toMatchObject({ tone: 'success', text: 'Opened 6:12 am' });
    expect(chip(-15).tone).toBe('success');
  });
  it('is warning when late', () => {
    expect(chip(40)).toMatchObject({ tone: 'warning', text: 'Opened 6:40 am · 40m late' });
  });
  it('has a short text without "Opened " for narrow bars', () => {
    expect(chip(12).shortText).toBe('6:12 am');
    expect(chip(40).shortText).toBe('6:40 am · 40m late');
    expect(chip(-20).shortText).toBe('5:40 am · 20m early');
  });
  it('is info when early', () => {
    expect(chip(-20)).toMatchObject({ tone: 'info', text: 'Opened 5:40 am · 20m early' });
  });
});

describe('buildBars', () => {
  const full = { ...tl, visible: true, reason: null, businessDate: '2026-10-12', nextWindow: null };
  const base: ShiftBarInput = {
    id: 's1',
    name: 'Morning',
    sequence: 1,
    openedAt: new Date(tl.dayStartAt - 11 * MIN).toISOString(), // opened 11m early
    closedAt: new Date(tl.dayStartAt + 7.9 * 60 * MIN).toISOString(),
    total: 100,
    variance: 0,
    scheduledStartAt: tl.dayStartAt,
    scheduledEndAt: tl.dayStartAt + 8 * 60 * MIN,
  };

  it('spans the Scheduled Shift Window, not the real open and close', () => {
    const [bar] = buildBars([base], full, tl.dayStartAt + 10 * 60 * MIN, 'Asia/Kolkata');
    expect(bar.leftPct).toBe(0);
    expect(bar.widthPct).toBeCloseTo(33.33, 1);
    expect(bar.times).toBe('Opened 5:49 am · closed 1:54 pm');
  });

  it('falls back to the real times when the shift has no known window', () => {
    const adHoc = { ...base, scheduledStartAt: null, scheduledEndAt: null };
    const [bar] = buildBars([adHoc], full, tl.dayStartAt + 10 * 60 * MIN, 'Asia/Kolkata');
    expect(bar.leftPct).toBe(0); // clamped: opened before Day Start
    expect(bar.widthPct).toBeCloseTo((7.9 / 24) * 100, 1);
  });
});

describe('hourTicks', () => {
  const segs = scheduleSegments(
    [tpl('am', '06:00', '14:00'), tpl('pm', '14:00', '22:00'), tpl('nt', '22:00', '06:00')],
    tl,
    '06:00',
  );
  it('ticks every hour Day Start to Day Start and marks template boundaries major', () => {
    const t = hourTicks(segs, tl, 'Asia/Kolkata');
    expect(t).toHaveLength(25);
    expect(t[0]).toMatchObject({ label: '6a', major: true });
    expect(t[1]).toMatchObject({ label: '7a', major: false });
    expect(t[8]).toMatchObject({ label: '2p', major: true });
    expect(t[16]).toMatchObject({ label: '10p', major: true });
    expect(t[24]).toMatchObject({ label: '6a', major: true });
  });
  it('ticks on the hour after a half-hour Day Start', () => {
    const half = { dayStartAt: tl.dayStartAt - 30 * MIN, dayEndAt: tl.dayEndAt - 30 * MIN }; // 5:30 am
    const t = hourTicks([], half, 'Asia/Kolkata');
    expect(t[0].label).toBe('6a');
    expect(t[0].leftPct).toBeCloseTo((30 / 1440) * 100, 3);
  });
});

describe('running bar progress', () => {
  it('is the elapsed share of the window', () => {
    const full = {
      ...tl,
      visible: true,
      reason: null,
      businessDate: '2026-10-12',
      nextWindow: null,
    };
    const live: ShiftBarInput = {
      id: 'l',
      name: 'S',
      sequence: 1,
      openedAt: new Date(tl.dayStartAt).toISOString(),
      closedAt: null,
      total: null,
      variance: null,
      scheduledStartAt: tl.dayStartAt,
      scheduledEndAt: tl.dayStartAt + 8 * 60 * MIN,
    };
    const [bar] = buildBars([live], full, tl.dayStartAt + 2 * 60 * MIN, 'Asia/Kolkata');
    expect(bar.progress).toBeCloseTo(0.25, 5);
  });
});

describe('carry-over', () => {
  const dayStartAt = Date.UTC(2026, 9, 13, 23, 30); // 05:00 IST on the 14th
  const tl5 = { dayStartAt, dayEndAt: dayStartAt + 1440 * MIN };
  const active = {
    businessDate: '2026-10-13',
    openedAt: '2026-10-13T16:30:00Z',
    shiftSequence: 3,
  };
  it('running: from an earlier day only', () => {
    expect(
      deriveCarryOver({ active, lastShift: null, businessDate: '2026-10-14', dayStartAt }),
    ).toMatchObject({ closedAt: null, sequence: 3, businessDate: '2026-10-13' });
    expect(
      deriveCarryOver({
        active: { ...active, businessDate: '2026-10-14' },
        lastShift: null,
        businessDate: '2026-10-14',
        dayStartAt,
      }),
    ).toBeNull();
  });
  const last = {
    status: 'CLOSED',
    openedAt: '2026-10-13T16:30:00Z',
    closedAt: '2026-10-14T00:35:00Z',
    businessDate: '2026-10-13',
    shiftSequence: 3,
  };
  it('closed: kept when it closed after today’s Day Start, also beside a running shift of today', () => {
    const today = { businessDate: '2026-10-14', openedAt: '2026-10-14T00:40:00Z' };
    for (const a of [null, today]) {
      expect(
        deriveCarryOver({ active: a, lastShift: last, businessDate: '2026-10-14', dayStartAt }),
      ).toMatchObject({ closedAt: last.closedAt, sequence: 3 });
    }
  });
  it('closed before Day Start or of today: none', () => {
    const args = { active: null, businessDate: '2026-10-14', dayStartAt };
    expect(
      deriveCarryOver({ ...args, lastShift: { ...last, closedAt: '2026-10-13T23:00:00Z' } }),
    ).toBeNull();
    expect(
      deriveCarryOver({ ...args, lastShift: { ...last, businessDate: '2026-10-14' } }),
    ).toBeNull();
  });
  it('bar spans the axis start to now (running) or to close (closed)', () => {
    const now = dayStartAt + 30 * MIN;
    const run = buildCarryBar(
      { openedAt: active.openedAt, closedAt: null, sequence: 3, businessDate: '2026-10-13' },
      { ...tl5, businessDate: '2026-10-14', visible: true, reason: null, nextWindow: null },
      now,
      'Asia/Kolkata',
    );
    expect(run).toMatchObject({ kind: 'running', leftPct: 0, carry: true, progress: 1 });
    expect(run.text).toBe('Shift 3 · from 13 Oct · live');
    expect(run.widthPct).toBeCloseTo((30 / 1440) * 100);
    const closed = buildCarryBar(
      {
        openedAt: active.openedAt,
        closedAt: last.closedAt,
        sequence: 3,
        businessDate: '2026-10-13',
      },
      { ...tl5, businessDate: '2026-10-14', visible: true, reason: null, nextWindow: null },
      now + 600 * MIN,
      'Asia/Kolkata',
    );
    expect(closed).toMatchObject({ kind: 'closed', text: 'Shift 3 · from 13 Oct' });
    expect(closed.widthPct).toBeCloseTo((65 / 1440) * 100);
  });
});
