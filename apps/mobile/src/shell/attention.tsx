import { useCallback } from 'react';
import { useNav } from './nav.js';
import { NeedsAttentionPage } from '../screens/NeedsAttentionPage.js';

/** Anchor of Home's "needs attention" section; the Home screen puts this id on it. */
export const HOME_ATTENTION_ID = 'home-attention';

/**
 * Where the header bell and Home's "All N ›" go: the Needs attention page, a
 * detail page pushed on the current tab (back returns to Home). Every caller
 * goes through this one function.
 */
export function useOpenAttention(): () => void {
  const nav = useNav();
  return useCallback(() => {
    nav.push(<NeedsAttentionPage />, 'attention');
  }, [nav]);
}
