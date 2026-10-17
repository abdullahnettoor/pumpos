import { useSyncExternalStore } from 'react';
import type { OfficeRecordKind, OfficeRecordLaunch } from '../office-records/kinds.js';

/**
 * Global quick-entry drawer store — a tiny dependency-free external store
 * (useSyncExternalStore) so any surface (a page button, the New menu, a
 * statement, the shift bar) can open an entry drawer IN PLACE, with no route
 * change. A single `QuickEntryHost` mounted at the app shell renders it.
 *
 * Office Records open the same drawer from everywhere (#526); the launch only
 * adds context (where it came from, a party fixed by a statement).
 */
export type QuickEntryType = OfficeRecordKind | 'merchandise-sale';

export interface QuickEntryState {
  open: boolean;
  type: QuickEntryType | null;
  launch?: OfficeRecordLaunch;
  /** Bumps on every open so the host re-initialises the form. */
  token: number;
}

let state: QuickEntryState = { open: false, type: null, token: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openQuickEntry(type: QuickEntryType, launch?: OfficeRecordLaunch) {
  state = { open: true, type, launch, token: state.token + 1 };
  emit();
}

export function closeQuickEntry() {
  if (!state.open) return;
  state = { ...state, open: false };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

export function useQuickEntry(): QuickEntryState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
