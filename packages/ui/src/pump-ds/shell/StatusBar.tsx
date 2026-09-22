import React, { type ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Dot } from '../dot/Dot.js';
import { Icon } from '../icon/index.js';
import type { SyncStatus } from '../sync-pulse/index.js';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuLabel,
} from '../menu/index.js';
import type { BusinessDayOption } from './TopBar.js';

/**
 * StatusBar — the app-shell bottom status strip. The ambient app-health line
 * that used to crowd the top bar now lives here: sync state · business-day
 * anchor (still interactive) · past-open-day warning · open-shift indicator ·
 * app version / update-available chip.
 *
 * Pure and fully controlled, mirroring `TopBar`: AppStatusBar wires it to real
 * query state. Never renders the same fact in two places — the top bar keeps
 * navigation and actions, this bar keeps status.
 *
 * Ships on desktop AND web; only the update-available chip (and its callback)
 * is desktop-only, gated by the container.
 */

export type BusinessDayStatus =
  | 'open'
  | 'closed'
  | 'not-created'
  | 'unknown'
  | 'unavailable';

export interface StatusBarProps {
  /** Sync status for the local-first engine. */
  syncStatus: SyncStatus;
  /** Pending mutations waiting to sync. */
  pendingSyncCount?: number;

  /** When false, business-day affordances are hidden (pre-onboarding hub). */
  showBusinessDay?: boolean;
  /** Current business date string (e.g. "09 Jul 2026"). */
  businessDate?: string;
  /** Status of the current business day. */
  businessDayStatus?: BusinessDayStatus;
  /** Callback when the current business-day row is selected. */
  onBusinessDay?: () => void;
  /** Past business days that remain open and need attention. */
  businessDays?: BusinessDayOption[];
  /** State of the past business days query. */
  businessDaysState?: 'ready' | 'loading' | 'unavailable';
  /** Callback when a past business day is selected. */
  onSelectBusinessDay?: (date: string) => void;
  /** Callback when the business-day menu opens or closes. */
  onBusinessDayMenuOpenChange?: (open: boolean) => void;

  /** Open-shift indicator label (e.g. "Shift 2 · 6h 12m"). Omit when none open. */
  openShiftLabel?: string;

  /** Installed app version (e.g. "1.4.2"). Shown on desktop AND web. */
  appVersion?: string | null;
  /** Newer version available (desktop only). Turns the version into an update chip. */
  updateAvailableVersion?: string | null;
  /** Clicked when an update is available. Desktop only. */
  onUpdate?: () => void;

  className?: string;
}

const SYNC_META: Record<SyncStatus, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string; pulse: boolean }> = {
  online: { tone: 'success', label: 'Synced', pulse: true },
  synced: { tone: 'success', label: 'Synced', pulse: true },
  pending: { tone: 'warning', label: 'Pending', pulse: true },
  failed: { tone: 'danger', label: 'Sync failed', pulse: true },
  offline: { tone: 'neutral', label: 'Offline', pulse: false },
};

function businessDayStatusLabel(status: BusinessDayStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'closed':
      return 'Closed';
    case 'not-created':
      return 'Not started';
    case 'unavailable':
      return 'Unavailable';
    default:
      return 'Checking';
  }
}

const Segment: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { as?: 'div' }
> = ({ className, children, ...rest }) => (
  <div
    className={cn(
      'inline-flex h-full items-center gap-1.5 px-2.5 text-[11.5px] text-ink-muted',
      className,
    )}
    {...rest}
  >
    {children}
  </div>
);

const Sep: React.FC = () => <div className="h-3.5 w-px bg-border-soft" />;

export const StatusBar: React.FC<StatusBarProps> = ({
  syncStatus,
  pendingSyncCount = 0,
  showBusinessDay = true,
  businessDate,
  businessDayStatus = 'unknown',
  onBusinessDay,
  businessDays = [],
  businessDaysState = 'ready',
  onSelectBusinessDay,
  onBusinessDayMenuOpenChange,
  openShiftLabel,
  appVersion,
  updateAvailableVersion,
  onUpdate,
  className,
}) => {
  const sync = SYNC_META[syncStatus];
  const syncLabel =
    syncStatus === 'pending' && pendingSyncCount > 0
      ? `Pending ${pendingSyncCount}`
      : syncStatus === 'failed' && pendingSyncCount > 0
        ? `Sync failed · ${pendingSyncCount}`
        : syncStatus === 'offline' && pendingSyncCount > 0
          ? `Offline · ${pendingSyncCount} pending`
          : sync.label;

  const pastOpenCount = businessDays.length;

  return (
    <div
      role="status"
      aria-label="App status"
      className={cn(
        'flex h-[26px] items-center border-t border-border-soft bg-surface-alt px-2 text-ink-muted',
        className,
      )}
    >
      {/* Sync */}
      <Segment
        className={cn(syncStatus === 'failed' && 'text-danger-fg')}
        data-testid="statusbar-sync"
      >
        <Dot tone={sync.tone} size="sm" pulse={sync.pulse} />
        <span>{syncLabel}</span>
      </Segment>

      {/* Business day */}
      {showBusinessDay && businessDate && (
        <>
          <Sep />
          <Menu onOpenChange={onBusinessDayMenuOpenChange}>
            <MenuTrigger asChild>
              <button
                type="button"
                data-testid="statusbar-business-day"
                className="inline-flex h-full items-center gap-1.5 rounded-none px-2.5 text-[11.5px] text-ink-muted transition-colors hover:bg-surface hover:text-ink-strong focus:outline-none focus-visible:outline-none"
              >
                <Dot
                  tone={businessDayStatus === 'open' ? 'success' : 'neutral'}
                  size="sm"
                />
                <span>
                  {businessDate} · {businessDayStatusLabel(businessDayStatus)}
                </span>
                <Icon name="chevron-up" size="xs" className="text-ink-faint" />
              </button>
            </MenuTrigger>
            {/* Opens upward out of the bottom bar. */}
            <MenuContent side="top" align="start">
              <MenuLabel>Business Day</MenuLabel>
              <MenuItem onSelect={onBusinessDay}>
                <span className="flex flex-1 items-center justify-between gap-3">
                  <span>Current Business Date · {businessDate}</span>
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      businessDayStatus === 'open' ? 'text-brand' : 'text-ink-muted',
                    )}
                  >
                    {businessDayStatusLabel(businessDayStatus)}
                  </span>
                </span>
              </MenuItem>
              {businessDaysState === 'ready' && businessDays.length > 0 && (
                <>
                  <MenuSeparator />
                  <MenuLabel>Past Open Business Days</MenuLabel>
                </>
              )}
              {businessDaysState === 'loading' && (
                <div className="px-2 py-1.5 text-[11px] text-ink-faint">
                  Checking Past Open Business Days
                </div>
              )}
              {businessDaysState === 'unavailable' && (
                <div className="px-2 py-1.5 text-[11px] text-danger-fg">
                  Past Open Business Days unavailable
                </div>
              )}
              {businessDays.length === 0 && businessDaysState === 'ready' && (
                <div className="px-2 py-1.5 text-[11px] text-ink-faint">
                  No Past Open Business Days
                </div>
              )}
              {businessDaysState === 'ready' &&
                businessDays.map((d) => (
                  <MenuItem key={d.date} onSelect={() => onSelectBusinessDay?.(d.date)}>
                    <span className="flex flex-1 items-center justify-between gap-4">
                      <span className="flex flex-col">
                        <span>{d.label}</span>
                        <span className="text-[10px] text-ink-faint">
                          {d.closedShiftCount ?? 0} closed · {d.openShiftCount ?? 0} open
                        </span>
                      </span>
                      <span className="text-[11px] text-brand">Open</span>
                    </span>
                  </MenuItem>
                ))}
            </MenuContent>
          </Menu>

          {/* Past-open-days warning — present only when days are open. */}
          {businessDaysState === 'ready' && pastOpenCount > 0 && (
            <Segment
              className="text-warning-fg"
              data-testid="statusbar-past-open-warning"
            >
              <Icon name="alert-triangle" size="xs" />
              <span>
                {pastOpenCount} past {pastOpenCount === 1 ? 'day' : 'days'} open
              </span>
            </Segment>
          )}
        </>
      )}

      <div className="flex-1" />

      {/* Open shift — present only when a shift is open. */}
      {openShiftLabel && (
        <Segment data-testid="statusbar-shift">
          <Dot tone="success" size="sm" />
          <span>{openShiftLabel}</span>
        </Segment>
      )}

      {/* Version / update. Version shows everywhere; the update chip is desktop-only. */}
      {(appVersion || updateAvailableVersion) && (
        <>
          {openShiftLabel && <Sep />}
          {updateAvailableVersion ? (
            <button
              type="button"
              data-testid="statusbar-update"
              onClick={onUpdate}
              className="inline-flex h-[18px] items-center gap-1 rounded-chip bg-info-bg px-2 text-[11px] font-medium text-info-fg transition-colors hover:brightness-95"
            >
              <Icon name="arrow-up" size="xs" />
              <span>Update to v{updateAvailableVersion}</span>
            </button>
          ) : (
            <Segment data-testid="statusbar-version">
              <span>v{appVersion}</span>
            </Segment>
          )}
        </>
      )}
    </div>
  );
};
