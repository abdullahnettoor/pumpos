import { describe, expect, it } from 'vitest';
import { windowLabel } from './window.js';

const IST = 'Asia/Kolkata';

describe('windowLabel', () => {
  it('shows the open and close time in the station timezone', () => {
    // 00:30Z = 6:00 am IST; 08:22Z = 1:52 pm IST
    expect(windowLabel('2026-10-09T00:30:00Z', '2026-10-09T08:22:00Z', IST)).toBe(
      '6:00 am – 1:52 pm',
    );
  });

  it('names the close day when the Shift runs past midnight', () => {
    expect(windowLabel('2026-10-09T16:30:00Z', '2026-10-10T00:34:00Z', IST)).toBe(
      '10:00 pm – 10 Oct, 6:04 am',
    );
  });

  it('says only when it opened if there is no close time', () => {
    expect(windowLabel('2026-10-09T00:30:00Z', null, IST)).toBe('Opened 6:00 am');
  });

  it('shows a dash for an unreadable open time', () => {
    expect(windowLabel(undefined, undefined, IST)).toBe('—');
  });
});
