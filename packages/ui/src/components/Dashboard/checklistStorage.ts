import { useCallback, useState } from 'react';

const SKIPS_KEY = 'pumpos_gs_skipped';

/** Read the skipped step ids saved in this browser. Storage failures read as none. */
export function readSkippedSteps(): string[] {
  try {
    const raw = localStorage.getItem(SKIPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeSkippedSteps(ids: string[]): void {
  try {
    localStorage.setItem(SKIPS_KEY, JSON.stringify(ids));
  } catch {
    /* storage blocked: the skip lasts for this session only */
  }
}

/** Skipped Get started steps, saved per device in browser storage. */
export function useChecklistSkips() {
  const [skipped, setSkipped] = useState<string[]>(readSkippedSteps);

  const skip = useCallback((id: string) => {
    setSkipped((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      writeSkippedSteps(next);
      return next;
    });
  }, []);

  const undoSkip = useCallback((id: string) => {
    setSkipped((prev) => {
      const next = prev.filter((x) => x !== id);
      writeSkippedSteps(next);
      return next;
    });
  }, []);

  return { skipped, skip, undoSkip };
}
