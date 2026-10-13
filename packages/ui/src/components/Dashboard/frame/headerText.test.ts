import { describe, expect, it } from 'vitest';
import { openDaysText } from './headerText.js';

describe('openDaysText', () => {
  it('only other days: warning sentence', () => {
    const t = openDaysText(['2026-10-12'], null);
    expect(t.info).toBe(false);
    expect(t.segments).toEqual([
      {
        bold: 'Mon 12 Oct',
        rest: 'is still open. Their daily reports stay drafts until each day is closed.',
      },
    ]);
  });
  it('only the running shift’s day: info sentence', () => {
    const t = openDaysText(['2026-10-13'], { businessDate: '2026-10-13', sequence: 3 });
    expect(t.info).toBe(true);
    expect(t.segments).toEqual([
      { bold: 'Tue 13 Oct', rest: 'closes after Shift 3 is handed over.' },
    ]);
  });
  it('both: two sentences, warning tone', () => {
    const t = openDaysText(['2026-10-11', '2026-10-12', '2026-10-13'], {
      businessDate: '2026-10-13',
      sequence: 3,
    });
    expect(t.info).toBe(false);
    expect(t.segments.map((s) => s.bold)).toEqual(['Tue 13 Oct', 'Sun 11 Oct and Mon 12 Oct']);
    expect(t.segments[1].rest).toMatch(/^are still open/);
  });
  it('running shift of an unlisted day is ignored', () => {
    const t = openDaysText(['2026-10-12'], { businessDate: '2026-10-14', sequence: 1 });
    expect(t.segments).toHaveLength(1);
  });
});
