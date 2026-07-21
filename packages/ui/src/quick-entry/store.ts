import { useSyncExternalStore } from 'react';

/**
 * Global quick-entry drawer store — a tiny dependency-free external store
 * (useSyncExternalStore) so any surface (command palette, shift control bar,
 * page buttons) can open an entry drawer IN PLACE, with no route change.
 *
 * The caller decides open-vs-navigate: for in-place types call `openQuickEntry`;
 * for actions that must land on a specific screen (e.g. credit sale on Shifts),
 * the caller navigates instead. A single `QuickEntryHost` mounted at the app
 * shell renders the active drawer.
 */
export type QuickEntryType = 'expense' | 'income' | 'collection' | 'purchase' | 'merchandise-sale';

export interface QuickEntryState {
  open: boolean;
  type: QuickEntryType | null;
  /** Per-form default values (merged into the form's defaults). */
  defaults?: Record<string, unknown>;
  /** Bumps on every open so the host re-initialises the form. */
  token: number;
}

let state: QuickEntryState = { open: false, type: null, token: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openQuickEntry(type: QuickEntryType, defaults?: Record<string, unknown>) {
  state = { open: true, type, defaults, token: state.token + 1 };
  emit();
}

export function closeQuickEntry() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return state;
}

export function useQuickEntry(): QuickEntryState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
