import { createContext } from 'react';

/** The unsaved-sections contexts (#604); see `UnsavedSections.tsx`. */

export interface UnsavedSection {
  /** Names the section in an error ("Tank levels"). */
  label: string;
  /** The form differs from what is saved. */
  dirty: boolean;
  /**
   * Validates and saves the form. Rejects with a readable Error when the form
   * is invalid or the save fails; the form stays as typed.
   */
  submit: () => Promise<void>;
  /** Puts the form back to its saved values (and renews its save key). */
  discard: () => void;
}

export interface SectionsState {
  set: (id: string, section: Omit<UnsavedSection, 'dirty'>) => void;
  remove: (id: string) => void;
  markDirty: (id: string, dirty: boolean) => void;
  save: (id: string) => Promise<boolean>;
  errorOf: (id: string) => string | null;
}

export interface BarState {
  dirty: string[];
  saving: boolean;
  saveAll: () => Promise<void>;
  discardAll: () => void;
}

export const SectionsContext = createContext<SectionsState | null>(null);
export const BarContext = createContext<BarState | null>(null);
