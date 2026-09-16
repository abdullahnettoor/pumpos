import { describe, expect, it } from 'vitest';
import { isMenuOpeningClick } from './Menu.js';

/**
 * Issue #85: the top-bar business-day pill renders its first item directly
 * under the cursor. Radix opens a DropdownMenu on pointerdown, so an
 * ordinary-speed click released on pointerup selected that item — the operator
 * was navigated to Shifts having never seen the menu.
 */
describe('menu pointer-select grace', () => {
  const openedAt = 1_000_000;

  it('treats the click that finished opening the menu as noise', () => {
    expect(isMenuOpeningClick(openedAt, openedAt + 20)).toBe(true);
    // A leisurely-but-still-single click: ~180ms between down and up.
    expect(isMenuOpeningClick(openedAt, openedAt + 180)).toBe(true);
  });

  it('lets a deliberate click through once the window passes', () => {
    expect(isMenuOpeningClick(openedAt, openedAt + 250)).toBe(false);
    expect(isMenuOpeningClick(openedAt, openedAt + 4000)).toBe(false);
  });

  it('never swallows a click that predates the open instant', () => {
    // Clock skew / a stale ref must fail open, never lock the menu.
    expect(isMenuOpeningClick(openedAt, openedAt - 5_000)).toBe(false);
  });
});
