import { useCallback } from 'react';
import { useNav } from './nav.js';
import { NeedsAttentionPage } from '../screens/NeedsAttentionPage.js';

/**
 * Where "All N ›" on Home (and, through `TabRoot`, the header bell) goes: the
 * Needs attention page, a detail page pushed on the current tab (back returns
 * to the tab it was opened from). Lives in the shell, the router hub that may
 * import screens; `HomeHeader` and `TabHeader` call it for the bell.
 */
export function useOpenAttention(): () => void {
  const nav = useNav();
  return useCallback(() => {
    nav.push(<NeedsAttentionPage />, 'attention');
  }, [nav]);
}
