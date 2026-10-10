import { createContext, useContext } from 'react';
import { businessDateSettings, type Role, type Station } from '@pump/shared';

/** What the header building blocks need from the shell around them. */
export interface ShellContextValue {
  /** The station every tab is showing (null while stations load). */
  station: Station | null;
  stationName: string;
  userName: string;
  /** The signed-in user's member id (the Team page keeps people from locking themselves out). */
  userId?: string | null;
  role: Role;
  /** Opens the Account sheet (station name and avatar both call this). */
  openAccount: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

/**
 * The IANA timezone of the selected station (the default zone with no shell or
 * station). Times shown to the operator read in it, never in the device's.
 */
export function useStationTimeZone(): string {
  const ctx = useContext(ShellContext);
  return businessDateSettings(ctx?.station?.settings).timeZone;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside <MobileShell>');
  return ctx;
}
