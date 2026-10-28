import { useCallback, useContext, useEffect, useLayoutEffect } from 'react';
import { SectionsContext, type UnsavedSection } from './sectionsContext.js';

/**
 * Joins a form to its tab's bar. Returns the section's last save error (null
 * once it saves) and `save`, for the form's own submit (Enter in a field).
 */
export function useUnsavedSection(
  id: string,
  section: UnsavedSection,
): { error: string | null; save: () => Promise<boolean> } {
  const ctx = useContext(SectionsContext);
  if (!ctx) throw new Error('useUnsavedSection must be used within an <UnsavedSectionsProvider>');
  const { set, remove, markDirty, save, errorOf } = ctx;
  const { label, dirty, submit, discard } = section;

  // The latest closures, every render, before any Save can run.
  useLayoutEffect(() => {
    set(id, { label, submit, discard });
  });
  useEffect(() => () => remove(id), [id, remove]);
  useEffect(() => {
    markDirty(id, dirty);
  }, [id, dirty, markDirty]);

  return { error: errorOf(id), save: useCallback(() => save(id), [id, save]) };
}
