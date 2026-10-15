import { describe, expect, it } from 'vitest';
import {
  historyCounts,
  historyTotalLabel,
  matchesHistory,
  newestFirst,
} from './shiftHistoryModel.js';

const row = (generatedAt: string, cashVariance: number | string) => ({
  generatedAt,
  snapshotData: { cashVariance },
});

describe('shift history', () => {
  const rows = [
    row('2026-10-13T08:30:00Z', 0),
    row('2026-10-14T08:30:00Z', '-350'),
    row('2026-10-12T08:30:00Z', 120),
    row('2026-10-11T08:30:00Z', 0.004),
  ];

  it('lists newest first', () => {
    expect(newestFirst(rows).map((r) => r.generatedAt.slice(0, 10))).toEqual([
      '2026-10-14',
      '2026-10-13',
      '2026-10-12',
      '2026-10-11',
    ]);
  });

  it('counts each variance state, half a paisa reading balanced', () => {
    expect(historyCounts(rows)).toEqual({ all: 4, short: 1, surplus: 1, balanced: 2 });
    expect(rows.filter((r) => matchesHistory(r, 'short'))).toHaveLength(1);
    expect(rows.filter((r) => matchesHistory(r, 'all'))).toHaveLength(4);
  });

  it('labels the total with what it covers', () => {
    expect(historyTotalLabel(4, false)).toBe('Total of 4 shifts');
    expect(historyTotalLabel(1, true)).toBe('Total of 1 shown');
  });
});
