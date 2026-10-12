import React, { createContext, useContext } from 'react';
import { canSeeDashboardCard, type DashboardCard, type Station } from '@pump/shared';
import type { NavIntent } from '../../AppShell.js';

export type DashboardRole = 'Owner' | 'Manager' | 'Accountant' | 'Staff';

export interface DashboardContextValue {
  station: Station;
  role: DashboardRole;
  userName: string;
  /** Station IANA timezone / Day Start ("HH:MM"), from `station.settings`. */
  timeZone: string | undefined;
  dayStartsAt: string | undefined;
  /** The current Business Day's date (YYYY-MM-DD), rolled over by Day Start. */
  businessDate: string;
  /** Today's calendar date in the station timezone (no Day Start): dates Office Records (ADR 0005). */
  entryDate: string;
  onNavigate: (path: string, intent?: NavIntent) => void;
}

const Ctx = createContext<DashboardContextValue | null>(null);

export const DashboardProvider: React.FC<{
  value: DashboardContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;

export function useDashboard(): DashboardContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDashboard must be used inside <DashboardProvider>');
  return v;
}

/**
 * The `enabled` flag for a card's query/queries. False for roles the gating
 * table hides the card from, so a hidden card never issues a request.
 */
export function useCardEnabled(card: DashboardCard): boolean {
  const { role, station } = useDashboard();
  return canSeeDashboardCard(card, role) && !!station.id;
}
