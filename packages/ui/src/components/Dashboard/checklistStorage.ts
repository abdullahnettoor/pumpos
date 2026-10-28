import { useCallback, useState } from 'react';

const SKIPS_KEY_PREFIX = 'pumpos_gs_skipped';

function skipsKey(scope: string): string {
  return `${SKIPS_KEY_PREFIX}:${scope}`;
}

/**
 * Read the skipped step ids saved in this browser for one Organization.
 * Storage failures read as none.
 */
export function readSkippedSteps(scope: string): string[] {
  try {
    const raw = localStorage.getItem(skipsKey(scope));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeSkippedSteps(scope: string, ids: string[]): void {
  try {
    localStorage.setItem(skipsKey(scope), JSON.stringify(ids));
  } catch {
    /* storage blocked: the skip lasts for this session only */
  }
}

/**
 * Skipped Get started steps, saved per device in browser storage and scoped to
 * the Organization, so a skip in one Organization never hides a step in another
 * (e.g. the demo Organization) on the same browser.
 */
export function useChecklistSkips(scope: string) {
  const [state, setState] = useState(() => ({ scope, skipped: readSkippedSteps(scope) }));

  const skipped = state.scope === scope ? state.skipped : readSkippedSteps(scope);

  const skip = useCallback(
    (id: string) => {
      setState((prev) => {
        const base = prev.scope === scope ? prev.skipped : readSkippedSteps(scope);
        const next = base.includes(id) ? base : [...base, id];
        writeSkippedSteps(scope, next);
        return { scope, skipped: next };
      });
    },
    [scope],
  );

  const undoSkip = useCallback(
    (id: string) => {
      setState((prev) => {
        const base = prev.scope === scope ? prev.skipped : readSkippedSteps(scope);
        const next = base.filter((x) => x !== id);
        writeSkippedSteps(scope, next);
        return { scope, skipped: next };
      });
    },
    [scope],
  );

  return { skipped, skip, undoSkip };
}
