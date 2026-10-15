import React, { useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { UnsavedChangesBar } from './UnsavedChangesBar.js';
import {
  BarContext,
  SectionsContext,
  type BarState,
  type SectionsState,
  type UnsavedSection,
} from './sectionsContext.js';
import { useUnsavedChangesGuard } from './unsavedChanges.js';

/**
 * One unsaved-changes bar for every in-page form of a tab (#604 review):
 * Station › Rules holds two forms but shows one bar, "2 sections changed",
 * so the page keeps one primary. Save saves each changed section in turn,
 * each through its own keyed save, and a section that fails shows its own
 * error and stays changed. Discard puts every section back. The provider also
 * registers the tab with the leave guard (`useUnsavedChangesGuard`).
 *
 *   <UnsavedSectionsProvider>
 *     <GeneralForm />            // useUnsavedSection('general', { … })
 *     <UnsavedSectionsBar />
 *   </UnsavedSectionsProvider>
 */

const message = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'That could not be saved.';

export const UnsavedSectionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Insertion order is mount order: sections save top to bottom.
  const sections = useRef(new Map<string, Omit<UnsavedSection, 'dirty'>>());
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const ordered = useCallback(
    (ids: string[]) => [...sections.current.keys()].filter((id) => ids.includes(id)),
    [],
  );

  const setError = useCallback((id: string, error: string | null) => {
    setErrors((prev) => {
      if ((prev[id] ?? null) === error) return prev;
      const next = { ...prev };
      if (error === null) delete next[id];
      else next[id] = error;
      return next;
    });
  }, []);

  const save = useCallback(
    async (id: string) => {
      const section = sections.current.get(id);
      if (!section) return true;
      try {
        await section.submit();
        setError(id, null);
        return true;
      } catch (error) {
        setError(id, message(error));
        return false;
      }
    },
    [setError],
  );

  // Stable, so a section's mount/unmount effects never re-run on a re-render.
  const set = useCallback<SectionsState['set']>(
    (id, section) => sections.current.set(id, section),
    [],
  );
  const remove = useCallback<SectionsState['remove']>(
    (id) => {
      sections.current.delete(id);
      setDirtyIds((prev) => prev.filter((d) => d !== id));
      setError(id, null);
    },
    [setError],
  );
  const markDirty = useCallback<SectionsState['markDirty']>(
    (id, dirty) =>
      setDirtyIds((prev) => {
        if (dirty === prev.includes(id)) return prev;
        return dirty ? [...prev, id] : prev.filter((d) => d !== id);
      }),
    [],
  );

  const context = useMemo<SectionsState>(
    () => ({ set, remove, markDirty, save, errorOf: (id) => errors[id] ?? null }),
    [set, remove, markDirty, save, errors],
  );

  const discardAll = useCallback(() => {
    ordered(dirtyIds).forEach((id) => sections.current.get(id)?.discard());
    setErrors({});
  }, [dirtyIds, ordered]);

  const saveAll = useCallback(async () => {
    setSaving(true);
    try {
      // One at a time: each through its own keyed save, in page order.
      for (const id of ordered(dirtyIds)) await save(id);
    } finally {
      setSaving(false);
    }
  }, [dirtyIds, ordered, save]);

  useUnsavedChangesGuard(dirtyIds.length > 0, discardAll);

  const bar = useMemo<BarState>(
    () => ({ dirty: dirtyIds, saving, saveAll, discardAll }),
    [dirtyIds, saving, saveAll, discardAll],
  );

  return (
    <SectionsContext.Provider value={context}>
      <BarContext.Provider value={bar}>{children}</BarContext.Provider>
    </SectionsContext.Provider>
  );
};

/** The tab's one bar: "Unsaved changes", or "N sections changed". */
export const UnsavedSectionsBar: React.FC = () => {
  const ctx = useContext(BarContext);
  if (!ctx) throw new Error('UnsavedSectionsBar must be used within an <UnsavedSectionsProvider>');
  const { dirty, saving, saveAll, discardAll } = ctx;
  return (
    <UnsavedChangesBar
      dirty={dirty.length > 0}
      saving={saving}
      label={dirty.length > 1 ? `${dirty.length} sections changed` : 'Unsaved changes'}
      onSave={() => void saveAll()}
      onDiscard={discardAll}
    />
  );
};

/** A section's save error, under its heading. */
export const SectionSaveError: React.FC<{ error: string | null }> = ({ error }) =>
  error ? (
    <p role="alert" className="text-[12px] text-danger-fg">
      {error}
    </p>
  ) : null;
