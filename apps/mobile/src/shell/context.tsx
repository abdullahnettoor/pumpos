import { createContext, useContext } from 'react';
import type { Station } from '@pump/shared';

/** What the header building blocks need from the shell around them. */
export interface ShellContextValue {
  /** The station every tab is showing (null while stations load). */
  station: Station | null;
  stationName: string;
  userName: string;
  role: string;
  /** Opens the Account sheet (station name and avatar both call this). */
  openAccount: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside <MobileShell>');
  return ctx;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
