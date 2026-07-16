import React, { useEffect, useState } from 'react';

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
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 16,
        padding: 24,
        textAlign: 'center',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ fontSize: 40, lineHeight: 1 }}>🖥️</div>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
        PumpOS Console is desktop-only
      </h1>
      <p style={{ maxWidth: 380, color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
        The full operations console is built for a desktop browser. On your
        phone, use the PumpOS mobile app for owner reports and live data.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {mUrl && (
          <a
            href={mUrl}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              backgroundColor: 'var(--brand, #2563eb)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Open PumpOS mobile
          </a>
        )}
        <a
          href="?desktop=1"
          style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'underline' }}
        >
          Continue to desktop version anyway
        </a>
      </div>
    </div>
  );
};
