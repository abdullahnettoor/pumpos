import React, { useMemo } from 'react';
import { type Station } from '@pump/shared';
import type { NavIntent } from './AppShell.js';
import { StatusBar, type SyncStatus, type BusinessDayOption } from '../pump-ds/index.js';
import { useBusinessDayStatus } from '../query/hooks.js';
import { useStationBusinessDate } from '../hooks/useStationBusinessDate.js';
import { useOpenShiftLabel } from '../hooks/useOpenShiftLabel.js';
import { formatBusinessDate } from '../utils/format.js';

/**
 * AppStatusBar — the data container for the pure pump-ds `StatusBar` (the
 * bottom app-health strip). Wires business-day, sync, and version/update state
 * that used to crowd the top bar into the status bar via the cached query
 * hooks.
 *
 * Kept OUT of pump-ds (it depends on app query hooks). pump-ds stays pure.
 *
 * The business-day query lives here (not in AppTopBar) now that the business
 * day is presented in the status bar; both containers must not run it twice.
 */

export interface AppStatusBarProps {
  selectedStation: Station | null;
  syncStatus: SyncStatus;
  pendingSyncCount?: number;
  onNavigate: (path: string, intent?: NavIntent) => void;
  /** When false the active station isn't operational yet (pre-onboarding hub). */
  stationReady?: boolean;
  /** Installed app version, shown on desktop AND web. Desktop provides it. */
  appVersion?: string | null;
  /** Newer version available (desktop only). Turns the version into an update chip. */
  updateAvailableVersion?: string | null;
  /** Phase-aware chip label (desktop only). Falls back to "Update to v…". */
  updateLabel?: string;
  /** Clicked when an update is available. Desktop only. */
  onUpdate?: () => void;
}

export const AppStatusBar: React.FC<AppStatusBarProps> = ({
  selectedStation,
  syncStatus,
  pendingSyncCount = 0,
  onNavigate,
  stationReady = true,
  appVersion,
  updateAvailableVersion,
  updateLabel,
  onUpdate,
}) => {
  const stationId = selectedStation?.id;

  // --- business day ---
  const settings = (selectedStation?.settings ?? {}) as {
    timezone?: string;
    business_day_starts_at?: string;
  };
  const businessIso = useStationBusinessDate(settings.timezone, settings.business_day_starts_at);
  const businessDate = formatBusinessDate(businessIso);
  const dayStatusQ = useBusinessDayStatus(stationId, businessIso, {
    enabled: !!stationId && stationReady,
  });
  const dayStatus = dayStatusQ.data;
  const businessDayStatus = dayStatusQ.isError
    ? 'unavailable'
    : dayStatusQ.isPending
      ? 'unknown'
      : dayStatus?.requestedState === 'OPEN'
        ? 'open'
        : dayStatus?.requestedState === 'CLOSED'
          ? 'closed'
          : 'not-created';

  const businessDays: BusinessDayOption[] = useMemo(() => {
    return (dayStatus?.pastOpenBusinessDays ?? []).map((day) => ({
      date: day.businessDate,
      label: formatBusinessDate(day.businessDate),
      status: 'open' as const,
      openShiftCount: Number(day.openShiftCount),
      closedShiftCount: Number(day.closedShiftCount),
      lastActivityAt: day.lastActivityAt,
    }));
  }, [dayStatus]);

  // --- open shift ---
  const openShiftLabel = useOpenShiftLabel(stationReady ? stationId : undefined);

  return (
    <StatusBar
      syncStatus={syncStatus}
      pendingSyncCount={pendingSyncCount}
      showBusinessDay={stationReady}
      businessDate={businessDate}
      businessDayStatus={businessDayStatus}
      onBusinessDay={() => onNavigate('/shifts', { openBusinessDayDate: businessIso })}
      businessDays={dayStatusQ.isError || dayStatusQ.isPending ? [] : businessDays}
      businessDaysState={
        dayStatusQ.isError ? 'unavailable' : dayStatusQ.isPending ? 'loading' : 'ready'
      }
      onSelectBusinessDay={(date) => onNavigate('/shifts', { openBusinessDayDate: date })}
      openShiftLabel={openShiftLabel}
      appVersion={appVersion}
      updateAvailableVersion={updateAvailableVersion}
      updateLabel={updateLabel}
      onUpdate={onUpdate}
    />
  );
};
