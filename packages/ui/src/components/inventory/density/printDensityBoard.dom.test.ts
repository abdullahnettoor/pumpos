// @vitest-environment jsdom
import { describe, expect, it } from 'vite-plus/test';
import type { DensityTodaySummary } from '@pump/shared';
import { buildDensityBoardHtml } from './printDensityBoard.js';

const reading = (density15: number) =>
  ({
    density15,
    businessDate: '2026-10-11',
  }) as DensityTodaySummary['products'][number]['latestToday'];

const summary: DensityTodaySummary = {
  businessDate: '2026-10-11',
  totalProducts: 2,
  recordedCount: 1,
  missingCount: 1,
  missingProducts: [],
  products: [
    {
      productId: 'a',
      productName: 'Motor <b>Spirit</b> & Co',
      productCode: 'MS',
      todayRecorded: true,
      latestToday: reading(753.84),
      trend14d: [],
      trendValues: [],
      lastReadings: [],
    },
    {
      productId: 'b',
      productName: 'Diesel',
      productCode: 'HSD',
      todayRecorded: false,
      latestToday: null,
      trend14d: [],
      trendValues: [],
      lastReadings: [],
    },
  ],
};

describe('buildDensityBoardHtml', () => {
  const doc = new DOMParser().parseFromString(
    buildDensityBoardHtml(summary, '<img src=x onerror=alert(1)> Station'),
    'text/html',
  );

  it('escapes interpolated names instead of injecting markup', () => {
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('.prod-name')?.textContent).toBe('Motor <b>Spirit</b> & Co (MS)');
    expect(doc.querySelector('.station-title')?.textContent).toBe(
      '<img src=x onerror=alert(1)> Station',
    );
  });

  it('shows date, the 15 °C heading and one large figure per product', () => {
    expect(doc.querySelector('.date-label')?.textContent).toBe('2026-10-11');
    expect(doc.querySelector('.board-title')?.textContent).toBe('Density at 15 °C');
    const figures = [...doc.querySelectorAll('.density-val')];
    expect(figures).toHaveLength(2);
    expect(figures[0]?.textContent).toBe('753.8');
  });

  it('is black on white with no grey text', () => {
    const css = doc.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/background:\s*#fff/);
    expect(css).not.toMatch(/#(?!000\b|fff\b)[0-9a-f]{3,6}\b/i);
  });
});
