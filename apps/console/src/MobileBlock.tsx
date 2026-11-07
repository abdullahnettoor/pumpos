import React, { useEffect, useState } from 'react';
import { Button, EmptyState, Icon } from '@pump/ui';

/**
 * Client-side fallback for the edge mobile gate (see `worker/index.ts`).
 *
 * The console is desktop-first. The edge Worker redirects phones to
 * `m.<zone>` before the SPA loads, but on hosts with no sibling mobile domain
 * (local dev, workers.dev) that redirect can't fire — so we also gate in-app.
 * Coarse pointer + narrow viewport is treated as "unsupported device".
 */
const MOBILE_QUERY = '(pointer: coarse) and (max-width: 900px)';

export function useIsUnsupportedMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    // Honor the same bypass the edge Worker uses.
    if (window.location.search.includes('desktop=1')) return false;
    if (document.cookie.includes('pumpos_force_desktop=1')) return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return;
    if (window.location.search.includes('desktop=1')) return;
    if (document.cookie.includes('pumpos_force_desktop=1')) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isMobile;
}

/** Best-effort sibling mobile host for the current console host. */
function mobileUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const { hostname } = window.location;
  if (hostname.startsWith('console.')) {
    return `https://m.${hostname.slice('console.'.length)}/`;
  }
  return null;
}

export const MobileBlock: React.FC = () => {
  const mUrl = mobileUrl();
  const navigateTo = (href: string) => () => window.location.assign(href);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas font-sans text-ink-strong">
      <EmptyState
        icon={<Icon name="monitor" />}
        title={<h1>PumpOS Console is desktop-only</h1>}
        description="The full operations console is built for a desktop browser. On your phone, use the PumpOS mobile app for owner reports and live data."
        action={
          <div className="flex flex-col items-center gap-2">
            {mUrl && <Button onClick={navigateTo(mUrl)}>Open PumpOS mobile</Button>}
            <Button variant="ghost" size="sm" onClick={navigateTo('?desktop=1')}>
              Continue to desktop version anyway
            </Button>
          </div>
        }
      />
    </div>
  );
};
