/** Width of the edge fade on a scrolled tab bar (#604). */
export const FADE_PX = 24;

/** Which ends of a scrolled bar hide tabs. */
export interface TabsOverflow {
  start: boolean;
  end: boolean;
}

/** Where the bar is scrolled to, from its scroll box (1px slack for subpixels). */
export function tabsOverflow(box: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): TabsOverflow {
  return {
    start: box.scrollLeft > 1,
    end: box.scrollLeft + box.clientWidth < box.scrollWidth - 1,
  };
}

/**
 * The scrollLeft that brings a tab fully into view, or null when it already
 * is. A tab past either edge lands just inside it, clear of the edge fade.
 */
export function scrollToReveal(
  box: { scrollLeft: number; clientWidth: number },
  tab: { offsetLeft: number; offsetWidth: number },
  margin = FADE_PX,
): number | null {
  const left = tab.offsetLeft - margin;
  const right = tab.offsetLeft + tab.offsetWidth + margin;
  if (left < box.scrollLeft) return Math.max(0, left);
  if (right > box.scrollLeft + box.clientWidth) return right - box.clientWidth;
  return null;
}
