import { describe, expect, it } from 'vitest';
import { resolveBusinessDate } from './business-date.js';
import { formatStationDateTime, historicalShiftMessage } from './shift-context.js';

describe('historical Shift context dates', () => {
  it('keeps a past Shift Business Date distinct from the Current Business Date', () => {
    const currentBusinessDate = resolveBusinessDate({
      now: new Date('2026-09-12T08:00:00.000Z'),
      timeZone: 'Asia/Kolkata',
      dayStartsAt: '06:00',
    });

    expect(currentBusinessDate).toBe('2026-09-12');
    expect(historicalShiftMessage('2026-09-10', currentBusinessDate)).toBe(
      'Working on 10 Sept 2026. Actions are being recorded on 12 Sept 2026.',
    );
    expect(historicalShiftMessage(currentBusinessDate, currentBusinessDate)).toBeNull();
  });

  it('resolves audit instants independently of the Shift Business Date', () => {
    const stationTime = formatStationDateTime('2026-09-12T01:30:00.000Z', 'Asia/Kolkata');

    expect(stationTime).toContain('12 Sept 2026');
    expect(stationTime).toContain('07:00');
    expect(formatStationDateTime('2026-09-12T01:30:00.000Z')).toContain('07:00');
  });
});
