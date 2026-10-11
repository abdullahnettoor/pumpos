/**
 * What a pinned header needs to know about the pane it sticks in, and the one
 * "has the content scrolled under me?" signal every header edge uses
 * (`PinnedHeader` for tab roots and detail pages, the Attendant app header).
 * The shell's `Pane` provides the context; without one (a header rendered on
 * its own) the header is simply never in its scrolled state.
 */
import { createContext, useCallback, useSyncExternalStore } from 'react';

export interface PaneChrome {
  /** The pane's scroll container; null until it mounts. */
  scroller: HTMLElement | null;
  /** The header's slot for a tab's page toolbar (see `PinnedToolbar`); null until the header mounts. */
  toolbarSlot: HTMLElement | null;
  setToolbarSlot: (el: HTMLElement | null) => void;
}

export const PaneChromeContext = createContext<PaneChrome | null>(null);

/** Custom property a pinned header publishes on its scroller: its height, for sticky things that sit below it. */
export const PINNED_HEADER_HEIGHT = '--pinned-header-h';

/**
 * True while `scroller` is scrolled away from its top (content is under the
 * header above it). Reads `scrollTop` itself, so it is right the moment the
 * scroller mounts or a hidden pane is shown again with its offset restored.
 */
export function useScrolled(scroller: HTMLElement | null): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!scroller) return () => {};
      scroller.addEventListener('scroll', onChange, { passive: true });
      return () => scroller.removeEventListener('scroll', onChange);
    },
    [scroller],
  );
  return useSyncExternalStore(
    subscribe,
    () => (scroller ? scroller.scrollTop > 0 : false),
    () => false,
  );
}

/**
 * The header edge: a hairline and a very soft shadow, drawn only once content
 * has scrolled under the header. The 1px border is always there (transparent at
 * the top) so the header never changes height.
 */
export const scrollEdgeClass = (scrolled: boolean): string =>
  `border-b motion-safe:transition-[box-shadow,border-color] motion-safe:duration-150 ${
    scrolled ? 'border-line shadow-edge' : 'border-transparent'
  }`;
