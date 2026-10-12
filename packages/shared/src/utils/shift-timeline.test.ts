import { describe, expect, it } from 'vitest';
import {
  dashboardTimeline,
  nextShiftToOpen,
  type TimelineShift,
  type TimelineTemplate,
} from './shift-timeline.js';

const clock = { timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' };
const at = (iso: string) => new Date(iso);
// IST = UTC+5:30. 06:00 IST = 00:30Z.
const templates: TimelineTemplate[] = [
  { id: 't1', name: 'Morning', startTime: '06:00', endTime: '14:00', isActive: true },
  { id: 't2', name: 'Evening', startTime: '14:00', endTime: '22:00', isActive: true },
  { id: 't3', name: 'Night', startTime: '22:00', endTime: '06:00', isActive: true },
  { id: 'x', name: 'Retired', startTime: '01:00', endTime: '02:00', isActive: false },
];
const shift = (t: string, o: string, c: string | null): TimelineShift => ({
  shiftTemplateId: t,
  openedAt: o,
  closedAt: c,
});
const run = (now: string, shifts: TimelineShift[], tpl = templates) =>
  dashboardTimeline({ now: at(now), shifts, templates: tpl, ...clock });

describe('dashboardTimeline', () => {
  it('is hidden before the first shift of the day opens', () => {
    const r = run('2026-10-09T01:00:00Z', []);
    expect(r).toMatchObject({ visible: false, reason: 'before-first-shift' });
  });

  it('is visible while a shift runs, even past its scheduled end', () => {
    const open = [shift('t1', '2026-10-09T00:40:00Z', null)];
    expect(run('2026-10-09T05:00:00Z', open).visible).toBe(true);
    expect(run('2026-10-09T10:00:00Z', open)).toMatchObject({ visible: true, nextWindow: null });
  });

  it('between shifts: visible with the next template window as a ghost', () => {
    const r = run('2026-10-09T08:45:00Z', [
      shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z'),
    ]);
    expect(r.visible).toBe(true);
    expect(r.nextWindow).toMatchObject({
      templateId: 't2',
      startAt: Date.parse('2026-10-09T08:30:00Z'),
      endAt: Date.parse('2026-10-09T16:30:00Z'),
    });
  });

  it('night template window runs past midnight to the next morning', () => {
    const r = run('2026-10-09T16:40:00Z', [
      shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z'),
      shift('t2', '2026-10-09T08:30:00Z', '2026-10-09T16:30:00Z'),
    ]);
    expect(r.nextWindow).toMatchObject({
      templateId: 't3',
      startAt: Date.parse('2026-10-09T16:30:00Z'),
      endAt: Date.parse('2026-10-10T00:30:00Z'),
    });
  });

  it('is hidden after the last scheduled shift has closed', () => {
    const r = run('2026-10-09T23:30:00Z', [
      shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z'),
      shift('t2', '2026-10-09T08:30:00Z', '2026-10-09T16:30:00Z'),
      shift('t3', '2026-10-09T16:30:00Z', '2026-10-09T23:00:00Z'),
    ]);
    expect(r).toMatchObject({ visible: false, reason: 'day-complete' });
  });

  it('is hidden once no remaining window is left to run', () => {
    // only Morning ran; it is past the end of the Night window (00:30Z next day)
    const r = run('2026-10-10T00:10:00Z', [
      shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z'),
    ]);
    expect(r.visible).toBe(true); // still 20 min of Night window left
    const late = run('2026-10-10T00:20:00Z', [
      shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z'),
    ]);
    expect(late.visible).toBe(true);
  });

  it('hides when the only unrun windows have already ended', () => {
    const only = templates.slice(0, 2);
    const r = run(
      '2026-10-09T17:00:00Z',
      [shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z')],
      only,
    );
    expect(r).toMatchObject({ visible: false, reason: 'day-complete' });
  });

  it('ignores inactive templates', () => {
    const r = run('2026-10-09T08:45:00Z', [
      shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z'),
    ]);
    expect(r.nextWindow?.templateId).not.toBe('x');
  });

  it('Day Start boundary: 05:59 IST still belongs to the previous day', () => {
    const r = run('2026-10-09T00:29:00Z', []); // 05:59 IST on the 9th -> business date 8th
    expect(r.businessDate).toBe('2026-10-08');
    expect(run('2026-10-09T00:30:00Z', []).businessDate).toBe('2026-10-09');
  });

  it('exposes the day axis (Day Start to Day Start)', () => {
    const r = run('2026-10-09T05:00:00Z', []);
    expect(r.dayStartAt).toBe(Date.parse('2026-10-09T00:30:00Z'));
    expect(r.dayEndAt).toBe(Date.parse('2026-10-10T00:30:00Z'));
  });

  it('is hidden with no templates and nothing running', () => {
    const r = run(
      '2026-10-09T08:45:00Z',
      [shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z')],
      [],
    );
    expect(r.visible).toBe(false);
  });
});

describe('nextShiftToOpen', () => {
  const two = templates.slice(0, 2);
  const next = (now: string, shifts: TimelineShift[], tpl = templates) =>
    nextShiftToOpen({ now: at(now), shifts, templates: tpl, ...clock });

  it('is Shift 1 before any shift, when templates exist', () => {
    expect(next('2026-10-09T01:00:00Z', [])).toEqual({ sequence: 1, window: null });
    expect(next('2026-10-09T01:00:00Z', [], [])).toBeNull();
  });

  it('is the next number between shifts', () => {
    const r = next('2026-10-09T08:45:00Z', [
      shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z'),
    ]);
    expect(r).toMatchObject({ sequence: 2, window: { templateId: 't2' } });
  });

  it('is null while a shift runs', () => {
    expect(next('2026-10-09T05:00:00Z', [shift('t1', '2026-10-09T00:40:00Z', null)])).toBeNull();
  });

  it('does not offer a skipped window that has passed', () => {
    // Evening (14:00–22:00 IST) skipped; it is 23:00 IST and only Morning ran.
    expect(
      next(
        '2026-10-09T17:30:00Z',
        [shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z')],
        two,
      ),
    ).toBeNull();
  });
});
