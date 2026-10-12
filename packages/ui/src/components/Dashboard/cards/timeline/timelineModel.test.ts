import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  buildBars,
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

describe('axisTicks', () => {
  it('ticks window starts and the final Day Start', () => {
    const segs = scheduleSegments(
      [tpl('a', '06:00', '14:00'), tpl('b', '14:00', '22:00'), tpl('c', '22:00', '06:00')],
      tl,
      '06:00',
    );
    expect(axisTicks(segs, tl, 'Asia/Kolkata').map((t) => t.label)).toEqual([
      '6 am',
      '2 pm',
      '10 pm',
      '6 am',
    ]);
  });

  it('drops ticks closer than 4%', () => {
    const segs = scheduleSegments(
      [tpl('a', '06:00', '06:30'), tpl('b', '06:30', '14:00')],
      tl,
      '06:00',
    );
    expect(axisTicks(segs, tl, 'Asia/Kolkata').map((t) => t.leftPct)).toEqual([0, 100]);
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
