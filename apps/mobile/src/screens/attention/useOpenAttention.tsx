import { useCallback } from 'react';
import { useNav } from '../../shell/nav.js';
import { NeedsAttentionPage } from '../NeedsAttentionPage.js';

/**
 * Where "All N ›" on Home (and, through `TabRoot`, the header bell) goes: the
 * Needs attention page, a detail page pushed on the current tab (back returns
 * to Home). Lives in screens/ because it imports the page; the shell receives
 * the callback instead of importing it.
 */
export function useOpenAttention(): () => void {
  const nav = useNav();
  return useCallback(() => {
    nav.push(<NeedsAttentionPage />, 'attention');
  }, [nav]);
}
