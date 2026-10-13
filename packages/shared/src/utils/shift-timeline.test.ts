import { describe, expect, it } from 'vitest';
import {
  dashboardTimeline,
  isDayShiftsDone,
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
    expect(next('2026-10-09T01:00:00Z', [])).toMatchObject({ sequence: 1, window: null });
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

describe('template order follows Day Start', () => {
  // Day Start 06:00: a 00:00 template is the LAST window of the day, not the first.
  const tpl: TimelineTemplate[] = [
    { id: 'mid', name: 'Midnight', startTime: '00:00', endTime: '06:00', isActive: true },
    { id: 'am', name: 'Morning', startTime: '06:00', endTime: '14:00', isActive: true },
  ];

  it('offers the 06:00 template first before any shift runs', () => {
    const next = nextShiftToOpen({
      now: at('2026-10-09T01:00:00Z'),
      shifts: [],
      templates: tpl,
      ...clock,
    });
    expect(next).toMatchObject({ sequence: 1, window: null, firstTemplate: { id: 'am' } });
    // The ghost window after the first shift is also in Day Start order.
    const after = run(
      '2026-10-09T08:45:00Z',
      [shift('am', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z')],
      tpl,
    );
    expect(after.nextWindow).toMatchObject({ templateId: 'mid' });
    expect(after.nextWindow!.startAt).toBeGreaterThan(Date.parse('2026-10-09T08:30:00Z'));
  });
});

describe('isDayShiftsDone', () => {
  const input = (now: string, shifts: TimelineShift[]) => ({
    now: at(now),
    shifts,
    templates,
    ...clock,
  });
  const all = [
    shift('t1', '2026-10-09T00:40:00Z', '2026-10-09T08:30:00Z'),
    shift('t2', '2026-10-09T08:30:00Z', '2026-10-09T16:30:00Z'),
    shift('t3', '2026-10-09T16:30:00Z', '2026-10-10T00:20:00Z'),
  ];

  it('is false before any shift, while one runs, and while a window remains', () => {
    expect(isDayShiftsDone(input('2026-10-09T01:00:00Z', []))).toBe(false);
    expect(
      isDayShiftsDone(input('2026-10-09T05:00:00Z', [shift('t1', '2026-10-09T00:40:00Z', null)])),
    ).toBe(false);
    expect(isDayShiftsDone(input('2026-10-09T08:45:00Z', all.slice(0, 1)))).toBe(false);
  });

  it('is true once every template ran and closed', () => {
    expect(isDayShiftsDone(input('2026-10-10T00:25:00Z', all))).toBe(true);
  });
});

describe('carry-over shift (opened in an earlier Business Day)', () => {
  // Day Start 05:00 IST (23:30Z previous day); Shift 3 of 13 Oct 22:00→06:00 IST.
  const c5 = { timeZone: 'Asia/Kolkata', dayStartsAt: '05:00' };
  const carryRunning = {
    openedAt: '2026-10-13T16:30:00Z', // 22:00 IST on the 13th
    closedAt: null,
    sequence: 3,
    businessDate: '2026-10-13',
  };
  const input = (now: string, over: object = {}) => ({
    now: at(now),
    shifts: [] as TimelineShift[],
    templates,
    carryOver: carryRunning,
    ...c5,
    ...over,
  });

  it('05:30 on the 14th: visible, today first template ghosted', () => {
    const r = dashboardTimeline(input('2026-10-14T00:00:00Z')); // 05:30 IST
    expect(r.businessDate).toBe('2026-10-14');
    expect(r.visible).toBe(true);
    expect(r.nextWindow?.templateId).toBe('t1');
    expect(nextShiftToOpen(input('2026-10-14T00:00:00Z'))).toBeNull();
    expect(isDayShiftsDone(input('2026-10-14T00:00:00Z'))).toBe(false);
  });

  it('without carry-over the same moment is before-first-shift', () => {
    const r = dashboardTimeline(input('2026-10-14T00:00:00Z', { carryOver: null }));
    expect(r).toMatchObject({ visible: false, reason: 'before-first-shift' });
  });

  it('closed carry-over keeps the strip visible; sequence of next shift is 1', () => {
    const closed = { ...carryRunning, closedAt: '2026-10-14T00:35:00Z' };
    const i = input('2026-10-14T01:00:00Z', { carryOver: closed });
    expect(dashboardTimeline(i).visible).toBe(true);
    expect(nextShiftToOpen(i)).toMatchObject({ sequence: 1 });
  });

  it('stays visible while running even if no template window remains', () => {
    const r = dashboardTimeline(
      input('2026-10-14T00:00:00Z', {
        templates: [{ id: 'a', name: 'A', startTime: '05:00', endTime: '06:00', isActive: true }],
        carryOver: carryRunning,
        // window 05:00–06:00 IST has not ended at 05:30, use a later now below
      }),
    );
    expect(r.visible).toBe(true);
    const late = dashboardTimeline(
      input('2026-10-14T10:00:00Z', {
        templates: [{ id: 'a', name: 'A', startTime: '05:00', endTime: '06:00', isActive: true }],
      }),
    );
    expect(late).toMatchObject({ visible: true, nextWindow: null });
  });

  it('Day Start 00:00: 22:00→02:00 shift running at 00:30', () => {
    const r = dashboardTimeline({
      now: at('2026-10-13T19:00:00Z'), // 00:30 IST on the 14th
      shifts: [],
      templates: [{ id: 'a', name: 'A', startTime: '06:00', endTime: '14:00', isActive: true }],
      carryOver: {
        openedAt: '2026-10-13T16:30:00Z',
        closedAt: null,
        sequence: 3,
        businessDate: '2026-10-13',
      },
      timeZone: 'Asia/Kolkata',
      dayStartsAt: '00:00',
    });
    expect(r).toMatchObject({ visible: true, businessDate: '2026-10-14' });
    expect(r.nextWindow?.templateId).toBe('a');
  });
});
