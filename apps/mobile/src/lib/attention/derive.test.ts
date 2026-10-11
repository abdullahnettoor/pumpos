import { describe, expect, it } from 'vitest';
import { deriveAlerts, type AlertSources } from './derive.js';
import { ALERT_KINDS, groupAlerts, homeAlerts } from './groups.js';

const none: AlertSources = {
  stock: [],
  customers: [],
  pastOpenDates: [],
  summaries: [],
  ownHandover: null,
};

const summary = (
  shiftId: string,
  openedAt: string,
  snap: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  shiftId,
  templateName: 'Shift 1',
  openedAt,
  businessDate: '2026-10-09',
  snapshotData: snap,
  ...extra,
});

const own = (saved: boolean) => ({
  title: 'Your handover · DU2',
  duLabel: 'DU2',
  shiftName: 'Shift 2',
  stationName: 'Highway Fuels',
  openedAt: null,
  saved,
  status: saved ? 'Saved' : 'Not saved yet',
});

describe('deriveAlerts', () => {
  it('is empty when nothing is wrong', () => {
    expect(deriveAlerts(none)).toEqual([]);
  });

  it('carries stock alerts with no action (no purchasing on mobile)', () => {
    const [a] = deriveAlerts({
      ...none,
      stock: [
        { id: 'tank-1', severity: 'danger', title: 'HSD critically low', meta: '8% · 3,600 L' },
      ],
    });
    expect(a).toMatchObject({ id: 'tank-1', category: 'stock', severity: 'danger' });
    expect(a.action).toBeUndefined();
  });

  it('raises one day alert per past open day, newest first, opening that day', () => {
    const days = deriveAlerts({
      ...none,
      pastOpenDates: ['2026-10-06', '2026-10-08', '2026-10-08'],
    });
    expect(days.map((a) => a.id)).toEqual(['day-2026-10-08', 'day-2026-10-06']);
    expect(days[0].action).toEqual({ kind: 'day', businessDate: '2026-10-08' });
    expect(days[0].title).toMatch(/8 Oct/);
  });

  it('raises one credit alert per customer over their limit, most over first, opening the customer', () => {
    const alerts = deriveAlerts({
      ...none,
      customers: [
        { id: 'c1', name: 'Under', creditLimit: 1000, currentBalance: 900 },
        { id: 'c2', name: 'At limit', creditLimit: 1000, currentBalance: 1000 },
        { id: 'c3', name: 'Slightly over', creditLimit: 1000, currentBalance: 1100 },
        { id: 'c4', name: 'KTC Logistics', creditLimit: 200000, currentBalance: 215000 },
        { id: 'c5', name: 'No limit', creditLimit: 0, currentBalance: 99999 },
        { id: 'c6', name: 'Advance', creditLimit: 500, currentBalance: -50 },
      ],
    });
    expect(alerts.map((a) => a.id)).toEqual(['credit-c4', 'credit-c3']);
    expect(alerts[0]).toMatchObject({
      title: 'KTC Logistics over credit limit',
      severity: 'danger',
      action: {
        kind: 'credit',
        customer: expect.objectContaining({ id: 'c4', name: 'KTC Logistics' }),
      },
    });
    expect(alerts[0].meta).toBe('₹2,15,000 of ₹2,00,000');
  });

  describe('cash variance', () => {
    const single = (cashVariance: number) => ({ cashVariance });

    it('flags a closed Shift past the threshold and opens its Shift Summary', () => {
      const [a] = deriveAlerts({
        ...none,
        summaries: [summary('s1', '2026-10-09T03:00:00Z', single(-340))],
      });
      expect(a).toMatchObject({
        id: 'var-s1',
        category: 'variance',
        severity: 'danger',
        title: 'Shift 1: Counted cash short by ₹340',
        action: { kind: 'variance', shiftId: 's1' },
      });
      expect(a.meta).toContain('Short');
    });

    it('names the level: attendants (with the Dispenser Unit) or the office count', () => {
      const alerts = deriveAlerts({
        ...none,
        summaries: [
          summary('s1', '2026-10-09T03:00:00Z', {
            cashVarianceModel: 2,
            attendantVariance: -340,
            officeCountVariance: 0,
            cashVariance: 0,
            drawers: [{ duName: 'DU3', variance: -340 }],
          }),
          summary('s2', '2026-10-08T03:00:00Z', {
            cashVarianceModel: 2,
            attendantVariance: 0,
            officeCountVariance: 250,
            cashVariance: 250,
          }),
        ],
      }).filter((a) => a.category === 'variance');
      expect(alerts.map((a) => a.title)).toEqual([
        'Shift 1: Attendants short by ₹340',
        'Shift 1: Office count over by ₹250',
      ]);
      expect(alerts[0].meta).toContain('DU3 short');
      expect(alerts[1].meta ?? '').not.toContain('Office count');
    });

    it('treats an overage as a warning, not danger', () => {
      const [a] = deriveAlerts({
        ...none,
        summaries: [summary('s1', '2026-10-09T03:00:00Z', single(250))],
      });
      expect(a).toMatchObject({ severity: 'warning', title: 'Shift 1: Counted cash over by ₹250' });
    });

    it('ignores a variance at or under the threshold, and balanced shifts', () => {
      expect(
        deriveAlerts({
          ...none,
          summaries: [
            summary('s1', '2026-10-09T03:00:00Z', single(-200)),
            summary('s2', '2026-10-09T05:00:00Z', single(0)),
          ],
        }),
      ).toEqual([]);
    });

    it('names the Drawer that is off for a two-level snapshot, using the attendant level', () => {
      const [a] = deriveAlerts({
        ...none,
        summaries: [
          summary('s1', '2026-10-09T03:00:00Z', {
            cashVarianceModel: 2,
            attendantVariance: -340,
            officeCountVariance: 0,
            cashVariance: -340,
            drawers: [{ duName: 'DU3', variance: -340 }],
          }),
        ],
      });
      expect(a.meta).toContain('DU3 short');
    });

    it('checks only the five newest closed Shifts', () => {
      const summaries = Array.from({ length: 7 }, (_, i) =>
        summary(`s${i}`, `2026-10-0${i + 1}T03:00:00Z`, single(-500)),
      );
      const ids = deriveAlerts({ ...none, summaries }).map((a) => a.id);
      expect(ids).toEqual(['var-s6', 'var-s5', 'var-s4', 'var-s3', 'var-s2']);
    });
  });

  it('raises the own handover only while it is not saved', () => {
    const [a] = deriveAlerts({ ...none, ownHandover: own(false) });
    expect(a).toMatchObject({
      id: 'handover-own',
      category: 'handover',
      action: { kind: 'handover' },
    });
    expect(a.meta).toBe('Shift 2 · DU2');
    expect(deriveAlerts({ ...none, ownHandover: own(true) })).toEqual([]);
  });

  it('orders by severity, then kind', () => {
    const alerts = deriveAlerts({
      stock: [
        { id: 't-warn', severity: 'warning', title: 'MS running low' },
        { id: 't-crit', severity: 'danger', title: 'HSD critically low' },
      ],
      customers: [{ id: 'c1', name: 'KTC', creditLimit: 10, currentBalance: 20 }],
      pastOpenDates: ['2026-10-08'],
      summaries: [summary('s1', '2026-10-09T03:00:00Z', { cashVariance: -340 })],
      ownHandover: own(false),
    });
    expect(alerts.map((a) => a.id)).toEqual([
      't-crit',
      'credit-c1',
      'var-s1',
      't-warn',
      'day-2026-10-08',
      'handover-own',
    ]);
  });
});

describe('groupAlerts', () => {
  it('groups by kind in page order, skipping empty kinds and keeping list order', () => {
    const alerts = deriveAlerts({
      stock: [{ id: 't1', severity: 'danger', title: 'HSD low' }],
      customers: [{ id: 'c1', name: 'KTC', creditLimit: 10, currentBalance: 20 }],
      pastOpenDates: ['2026-10-07', '2026-10-08'],
      summaries: [],
      ownHandover: own(false),
    });
    const groups = groupAlerts(alerts);
    expect(groups.map((g) => g.category)).toEqual(['stock', 'day', 'credit', 'handover']);
    expect(groups.find((g) => g.category === 'day')!.alerts.map((a) => a.id)).toEqual([
      'day-2026-10-08',
      'day-2026-10-07',
    ]);
    // Every alert is in exactly one group: the page lists what the badge counts.
    expect(groups.reduce((n, g) => n + g.alerts.length, 0)).toBe(alerts.length);
  });

  it('knows the five kinds, in page order', () => {
    expect(Object.keys(ALERT_KINDS)).toEqual(['stock', 'day', 'credit', 'variance', 'handover']);
  });
});

describe('homeAlerts', () => {
  it('takes the top alerts but skips the own handover, which the pinned card shows', () => {
    const alerts = deriveAlerts({
      ...none,
      pastOpenDates: ['2026-10-07', '2026-10-08'],
      ownHandover: own(false),
    });
    expect(alerts.map((a) => a.id)).toEqual(['day-2026-10-08', 'day-2026-10-07', 'handover-own']);
    expect(homeAlerts(alerts, 3).map((a) => a.id)).toEqual(['day-2026-10-08', 'day-2026-10-07']);
    expect(homeAlerts(alerts.slice(2), 2)).toEqual([]);
  });
});
