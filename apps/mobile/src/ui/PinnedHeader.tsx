import React, { useContext, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  PINNED_HEADER_HEIGHT,
  PaneChromeContext,
  scrollEdgeClass,
  useScrolled,
} from './scrollEdge.js';

/**
 * The sticky frame of every header inside a pane (tab roots and detail pages):
 * pinned to the top of the pane's scroll area on the canvas colour, so content
 * scrolls cleanly under it, with the shared scroll edge (hairline + soft shadow
 * only while content is under it). It publishes its height as
 * `--pinned-header-h` on the scroller, for things that stick below it (the
 * handover summary strip) and for scroll-into-view (`scroll-padding-top`).
 *
 * Render the header's own `<header>` inside. It is also where a tab's page
 * toolbar lands (`PinnedToolbar`).
 */
export const PinnedHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chrome = useContext(PaneChromeContext);
  const scroller = chrome?.scroller ?? null;
  const scrolled = useScrolled(scroller);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !scroller) return;
    const publish = () => scroller.style.setProperty(PINNED_HEADER_HEIGHT, `${el.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      scroller.style.removeProperty(PINNED_HEADER_HEIGHT);
    };
  }, [scroller]);

  return (
    <div
      ref={ref}
      data-pinned-header=""
      data-scrolled={scrolled}
      className={`sticky top-0 z-20 bg-background ${scrollEdgeClass(scrolled)}`}
    >
      {children}
      <div ref={chrome?.setToolbarSlot} className="empty:hidden" />
    </div>
  );
};

/**
 * A page toolbar that stays pinned with the header (the Money list switch, the
 * Insights range switch). It is rendered by the screen, so its state stays the
 * screen's, but it lands inside the pane's `PinnedHeader`. Outside a pane it
 * simply renders in place.
 */
export const PinnedToolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chrome = useContext(PaneChromeContext);
  if (!chrome) return <>{children}</>;
  return chrome.toolbarSlot
    ? createPortal(<div className="flex flex-col pb-2.5">{children}</div>, chrome.toolbarSlot)
    : null;
};
