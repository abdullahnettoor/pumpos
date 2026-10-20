import { describe, expect, it } from 'vite-plus/test';
import { historyTotalLabel, newestFirst } from './shiftHistoryModel.js';

describe('shift history', () => {
  it('lists newest first', () => {
    const rows = [
      { generatedAt: '2026-10-13T08:30:00Z' },
      { generatedAt: '2026-10-14T08:30:00Z' },
      { generatedAt: null },
      { generatedAt: '2026-10-12T08:30:00Z' },
    ];
    expect(newestFirst(rows).map((r) => r.generatedAt?.slice(0, 10) ?? null)).toEqual([
      '2026-10-14',
      '2026-10-13',
      '2026-10-12',
      null,
    ]);
  });

  it('labels the total with how many shifts it covers', () => {
    expect(historyTotalLabel(4)).toBe('Total of 4 shifts');
    expect(historyTotalLabel(1)).toBe('Total of 1 shift');
  });
});
