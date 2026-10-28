import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useOptionalConfirm } from '../../components/primitives/ConfirmDialog.js';

/**
 * The unsaved-changes guard (#604): one app-wide record of the in-page forms
 * that differ from what is saved. While any does, leaving asks first:
 *
 * - an in-app route change (`useRoutePath`), a tab switch or a station switch
 *   call `guardLeave(proceed)`;
 * - closing or reloading the browser tab is caught by `beforeunload`;
 * - the desktop window's close is caught by the shell (Tauri close-requested),
 *   which asks through `confirmDiscardUnsaved()`.
 *
 * Confirming discards the changes (each form resets to its saved values), so a
 * leave that keeps the form mounted (a station switch) cannot carry them on.
 */

export const LEAVE_PROMPT = {
  title: 'Discard unsaved changes?',
  message: "Your changes on this page haven't been saved.",
  confirmLabel: 'Discard changes',
  cancelLabel: 'Keep editing',
  danger: true,
} as const;

interface GuardEntry {
  ask: () => Promise<boolean>;
  discard: () => void;
}

const entries = new Map<symbol, GuardEntry>();
const listeners = new Set<() => void>();
let pending: Promise<boolean> | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The browser's own leave prompt, while anything is unsaved. */
function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Older engines show the prompt only when returnValue is set.
  event.returnValue = '';
}

function register(id: symbol, entry: GuardEntry) {
  if (entries.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', onBeforeUnload);
  }
  entries.set(id, entry);
  emit();
}

function unregister(id: symbol) {
  if (!entries.delete(id)) return;
  if (entries.size === 0 && typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', onBeforeUnload);
  }
  emit();
}

/** Whether any in-page form has unsaved changes. */
export function hasUnsavedChanges(): boolean {
  return entries.size > 0;
}

/**
 * Asks once whether to drop the unsaved changes; resolves true at once when
 * there are none. Confirming discards them. Concurrent asks share one dialog.
 */
export function confirmDiscardUnsaved(): Promise<boolean> {
  if (entries.size === 0) return Promise.resolve(true);
  if (pending) return pending;
  const [first] = entries.values();
  pending = first
    .ask()
    .then((ok) => {
      if (ok) [...entries.values()].forEach((entry) => entry.discard());
      return ok;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Runs `proceed` now when nothing is unsaved, else after the operator confirms. */
export function guardLeave(proceed: () => void): void {
  if (entries.size === 0) {
    proceed();
    return;
  }
  void confirmDiscardUnsaved().then((ok) => {
    if (ok) proceed();
  });
}

/** Re-renders when the guard turns on or off (e.g. to demote a page primary). */
export function useHasUnsavedChanges(): boolean {
  return useSyncExternalStore(subscribe, hasUnsavedChanges, () => false);
}

/**
 * Registers a form with the guard while `dirty`. `discard` puts it back to its
 * saved values when the operator confirms leaving.
 */
export function useUnsavedChangesGuard(dirty: boolean, discard: () => void): void {
  const confirm = useOptionalConfirm();
  const latest = useRef({ confirm, discard });
  useEffect(() => {
    latest.current = { confirm, discard };
  });
  useEffect(() => {
    if (!dirty) return;
    const id = Symbol('unsaved-form');
    register(id, {
      ask: () => {
        const ask = latest.current.confirm;
        if (ask) return ask({ ...LEAVE_PROMPT });
        // Outside a ConfirmProvider: the browser's own dialog.
        return Promise.resolve(
          typeof window === 'undefined' || typeof window.confirm !== 'function'
            ? true
            : window.confirm(`${LEAVE_PROMPT.title} ${LEAVE_PROMPT.message}`),
        );
      },
      discard: () => latest.current.discard(),
    });
    return () => unregister(id);
  }, [dirty]);
}

/** Tests only: forget every registration. */
export function __resetUnsavedChangesForTests(): void {
  [...entries.keys()].forEach(unregister);
  pending = null;
}
