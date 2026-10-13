import { useCallback, useEffect, useState } from 'react';
import { resolveRoute } from './routes.js';

/**
 * The shell's current page, mirrored into the URL hash (`#/shifts`) so a reload
 * lands where the operator was and browser back/forward work.
 *
 * Hash, not pathname: the desktop shell loads from Tauri's bundled
 * `frontendDist`, which has no SPA fallback for deep paths, and the console
 * keeps real pathnames (e.g. `/accept-invite`) for pre-auth routes.
 *
 * `/login` is a transient auth state, never written to the URL, so signing in
 * again returns to the page in the hash.
 *
 * A renamed route (`#/purchases`) resolves to its new home (`#/suppliers`) on
 * load, on back/forward and on navigation, and the URL is rewritten in place.
 */
const TRANSIENT = new Set(['/login']);

function readHashPath(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') && raw.length > 1 ? resolveRoute(raw) : null;
}

export function useRoutePath(
  defaultPath: string,
): [string, (next: string | ((prev: string) => string)) => void] {
  const [path, setPath] = useState(() => readHashPath() ?? resolveRoute(defaultPath));

  useEffect(() => {
    if (TRANSIENT.has(path)) return;
    const raw = window.location.hash.replace(/^#/, '');
    if (raw === path) return;
    // An old hash that resolved here is rewritten, not pushed: Back must not
    // land on the legacy URL and bounce straight forward again.
    if (readHashPath() === path) window.history.replaceState(null, '', `#${path}`);
    else window.history.pushState(null, '', `#${path}`);
  }, [path]);

  useEffect(() => {
    const onHash = () => {
      const next = readHashPath();
      if (next) setPath(next);
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const navigate = useCallback((next: string | ((prev: string) => string)) => {
    setPath((prev) => resolveRoute(typeof next === 'function' ? next(prev) : next));
  }, []);

  return [path, navigate];
}
