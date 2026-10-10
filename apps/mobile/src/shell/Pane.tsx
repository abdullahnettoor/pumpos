import React, { useLayoutEffect, useRef } from 'react';
import { PageActiveContext } from '../ui/backStack.js';

interface Props {
  /** The page currently shown. Inactive panes stay mounted (state, scroll) but hidden. */
  active: boolean;
  /**
   * Where the pane's scroll area ends:
   *  - `under-dock` (default): fills the screen, with room at the end so the
   *    last row can scroll clear of the floating dock;
   *  - `full`: fills the screen (detail pages; their action bar sits in the flow).
   */
  bottom?: 'under-dock' | 'full';
  /**
   * Counts tab switches. When it changes while this pane is the one shown, the
   * pane fades in (see `playEnter`). Panes that are not shown just note it, so
   * popping back to them later does not replay it.
   */
  enterKey?: number;
  /** A pane that mounts as part of the tab switch it should animate for (a tab's first visit). */
  enterOnMount?: boolean;
  children: React.ReactNode;
}

export const ENTER_MS = 180;

/** True when the user asked for less motion (OS setting). */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The incoming tab's content fades and rises a few pixels. A one-off Web
 * Animation (nothing is left on the element, so scroll, stacking and the pane's
 * own layout are untouched); skipped under reduced motion.
 */
export function playEnter(el: HTMLElement): void {
  if (prefersReducedMotion() || typeof el.animate !== 'function') return;
  el.animate(
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: ENTER_MS, easing: 'ease-out' },
  );
}

const BOTTOM: Record<NonNullable<Props['bottom']>, string> = {
  'under-dock': 'inset-0 pb-[var(--dock-space)]',
  full: 'inset-0',
};

/**
 * One page of a stack in its own scroll container. A hidden pane (`display:none`)
 * loses its scroll offset in some browsers, so the offset is tracked on scroll
 * and put back when the pane becomes active again.
 */
export const Pane: React.FC<Props> = ({
  active,
  bottom = 'under-dock',
  enterKey = 0,
  enterOnMount = false,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const savedTop = useRef(0);
  const seenEnter = useRef(enterOnMount ? 0 : enterKey);

  useLayoutEffect(() => {
    if (active && ref.current) ref.current.scrollTop = savedTop.current;
  }, [active]);

  useLayoutEffect(() => {
    if (enterKey === seenEnter.current) return;
    seenEnter.current = enterKey;
    if (active && enterKey > 0 && ref.current) playEnter(ref.current);
  }, [active, enterKey]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        if (active) savedTop.current = e.currentTarget.scrollTop;
      }}
      className={`absolute overflow-y-auto overscroll-contain ${BOTTOM[bottom]} ${active ? '' : 'hidden'}`}
      aria-hidden={!active}
    >
      <PageActiveContext.Provider value={active}>{children}</PageActiveContext.Provider>
    </div>
  );
};
