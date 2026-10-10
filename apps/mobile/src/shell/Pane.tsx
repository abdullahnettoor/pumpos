import React, { useLayoutEffect, useRef } from 'react';

interface Props {
  /** The page currently shown. Inactive panes stay mounted (state, scroll) but hidden. */
  active: boolean;
  /**
   * Where the pane's scroll area ends:
   *  - `under-dock` (default): fills the screen, with room at the end so the
   *    last row can scroll clear of the floating dock;
   *  - `above-dock`: stops above the dock (a page with its own sticky bottom bar);
   *  - `full`: fills the screen (detail pages; their action bar sits in the flow).
   */
  bottom?: 'under-dock' | 'above-dock' | 'full';
  children: React.ReactNode;
}

const BOTTOM: Record<NonNullable<Props['bottom']>, string> = {
  'under-dock': 'inset-0 pb-[var(--dock-space)]',
  'above-dock': 'inset-x-0 top-0 bottom-[var(--dock-space)]',
  full: 'inset-0',
};

/**
 * One page of a stack in its own scroll container. A hidden pane (`display:none`)
 * loses its scroll offset in some browsers, so the offset is tracked on scroll
 * and put back when the pane becomes active again.
 */
export const Pane: React.FC<Props> = ({ active, bottom = 'under-dock', children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const savedTop = useRef(0);

  useLayoutEffect(() => {
    if (active && ref.current) ref.current.scrollTop = savedTop.current;
  }, [active]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        if (active) savedTop.current = e.currentTarget.scrollTop;
      }}
      className={`absolute overflow-y-auto overscroll-contain ${BOTTOM[bottom]} ${active ? '' : 'hidden'}`}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
};
