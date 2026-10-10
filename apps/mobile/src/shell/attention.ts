import { useCallback } from 'react';
import { useNav } from './nav.js';

/** Anchor of Home's "needs attention" section; the Home screen puts this id on it. */
export const HOME_ATTENTION_ID = 'home-attention';

/**
 * Where the header bell goes. Until the Needs attention page exists (#404) that
 * is Home's attention section: scroll it into view and focus it. #404 swaps the
 * body for `nav.push(<NeedsAttentionPage />, 'attention')`; the bell keeps
 * calling this one function.
 */
export function useOpenAttention(): () => void {
  const nav = useNav();
  return useCallback(() => {
    nav.select('home', { toRoot: true });
    // After the select has rendered: the section sits in Home's own pane.
    window.setTimeout(() => {
      const section = document.getElementById(HOME_ATTENTION_ID);
      if (!section) return;
      section.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      section.focus({ preventScroll: true });
    }, 0);
  }, [nav]);
}
