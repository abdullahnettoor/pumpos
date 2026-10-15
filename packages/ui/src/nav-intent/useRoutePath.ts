import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveRoute } from './routes.js';
import { guardLeave } from '../pump-ds/form/unsavedChanges.js';

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
 *
 * A navigation with `{ replace: true }` rewrites the current history entry
 * instead of adding one: a page's own state in its URL (an account's
 * statement period, #576) must not make Back step through every change.
 */
const TRANSIENT = new Set(['/login']);

function readHashPath(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.replace(/^#/, '');
  return raw.startsWith('/') && raw.length > 1 ? resolveRoute(raw) : null;
}

/**
 * The route the current history entry was opened from, when this app pushed
 * it (`history.state.prev`). Survives back/forward and a reload, so a detail
 * page can tell whether Back lands on its parent (#576). Null when unknown.
 */
export function previousRoute(): string | null {
  if (typeof window === 'undefined') return null;
  const state = window.history.state as { prev?: unknown } | null;
  return typeof state?.prev === 'string' ? state.prev : null;
}

export type RouteNavigate = (
  next: string | ((prev: string) => string),
  options?: { replace?: boolean },
) => void;

export function useRoutePath(defaultPath: string): [string, RouteNavigate] {
  const [path, setPath] = useState(() => readHashPath() ?? resolveRoute(defaultPath));
  // Whether the navigation that set `path` asked to replace the history entry.
  const replaceNext = useRef(false);

  useEffect(() => {
    const replace = replaceNext.current;
    replaceNext.current = false;
    if (TRANSIENT.has(path)) return;
    const raw = window.location.hash.replace(/^#/, '');
    if (raw === path) return;
    // An old hash that resolved here is rewritten, not pushed: Back must not
    // land on the legacy URL and bounce straight forward again.
    // A replaced entry keeps where it was opened from; a pushed one records it.
    if (replace || readHashPath() === path) {
      window.history.replaceState(window.history.state, '', `#${path}`);
    } else {
      window.history.pushState(raw.startsWith('/') ? { prev: raw } : null, '', `#${path}`);
    }
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

  const current = useRef(path);
  useEffect(() => {
    current.current = path;
  }, [path]);
  const navigate = useCallback<RouteNavigate>((next, options) => {
    const go = () =>
      setPath((prev) => {
        const resolved = resolveRoute(typeof next === 'function' ? next(prev) : next);
        if (resolved !== prev) replaceNext.current = !!options?.replace;
        return resolved;
      });
    // Leaving a page with unsaved changes asks first (#604). Staying on the
    // same route (a re-render, a replace of the same path) never asks.
    const target = resolveRoute(typeof next === 'function' ? next(current.current) : next);
    if (target === current.current) go();
    else guardLeave(go);
  }, []);

  return [path, navigate];
}
