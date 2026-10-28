import { describe, expect, it } from 'vite-plus/test';
import { POPOVER_GAP, anchoredPosition } from './anchoredPopover.js';

const viewport = { width: 1366, height: 768 };
const rect = (left: number, top: number, width = 120, height = 32) => ({
  left,
  top,
  width,
  right: left + width,
  bottom: top + height,
});

// One positioning rule for DateRangeMenu and DatePickerButton (#603 review).
describe('anchoredPosition', () => {
  it('opens below the trigger, on its start edge in the left half', () => {
    expect(anchoredPosition(rect(24, 100), 300, viewport)).toEqual({
      position: 'fixed',
      top: 132 + POPOVER_GAP,
      left: 24,
    });
  });

  it('lines up with the end edge in the right half, or as asked', () => {
    expect(anchoredPosition(rect(1200, 100), 300, viewport)).toMatchObject({ right: 46 });
    expect(anchoredPosition(rect(1200, 100), 300, viewport, 'start')).toMatchObject({
      left: 1200,
    });
    expect(anchoredPosition(rect(24, 100), 300, viewport, 'end')).toMatchObject({
      right: 1366 - 144,
    });
  });

  it('flips above when there is no room below and more above', () => {
    expect(anchoredPosition(rect(24, 600), 300, viewport)).toEqual({
      position: 'fixed',
      bottom: 768 - 600 + POPOVER_GAP,
      left: 24,
    });
    // Short of room both ways: stays below, where there is more.
    expect(anchoredPosition(rect(24, 300), 600, viewport)).toMatchObject({
      top: 332 + POPOVER_GAP,
    });
  });
});
