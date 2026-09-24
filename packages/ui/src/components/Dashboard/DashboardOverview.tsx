import React, { useState } from 'react';
import { CloudShiftService } from '../../services/cloud.js';
import {
  useDashboardSummary,
  useInvalidateOperational,
  useInventoryStatus,
  usePricing,
  useProducts,
  useExpenses,
  usePurchases,
  useCollections,
  useCustomers,
  useSuppliers,
  useDailyDssrPreview,
  useUsers,
} from '../../query/hooks.js';
import { useStationAlerts } from '../../query/useStationAlerts.js';
import { SkeletonGrid } from '../primitives/Skeleton.js';
import { GettingStartedChecklist, type ChecklistStep } from './GettingStartedChecklist.js';
import {
  KpiStrip,
  KpiTile,
  Button,
  PageHeader,
  Panel,
  EmptyState,
  MeterRow,
  StatusChip,
  Chip,
} from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { inr, formatQty } from '../../utils/format.js';
import { classifyTank, tankPct, OVER_CAPACITY_EXPLANATION } from '../../utils/stock.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useToast } from '../primitives/ToastProvider.js';
import { Station, canOnboardStation, resolveBusinessDate, resolveEntryDate } from '@pump/shared';
import { STATION_SETUP_IN_PROGRESS } from '../StationSetup/StationOnboardingLockout.js';
import type { NavIntent } from '../AppShell.js';
import {
  Play,
  Plus,
  FileText,
  Unlock,
  AlertTriangle,
  Lock,
  Droplet,
  ClipboardList,
  CircleCheckBig,
  ChevronRight,
  TriangleAlert,
  Clock,
  Fuel,
  Users,
} from 'lucide-react';

const shiftService = new CloudShiftService();

interface DashboardOverviewProps {
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
  onNavigate: (path: string, intent?: NavIntent) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  selectedStation,
  userRole,
  userName,
  onNavigate,
}) => {
  // One bounded dashboard read (#147): shift identities + today's rollup.
  const {
    data: summary,
    isLoading: loading,
    error,
    refetch,
  } = useDashboardSummary(selectedStation?.id);
  const canSeeFinancials = userRole !== 'Staff';
  const { data: tanks } = useInventoryStatus(selectedStation?.id);
  const { data: prices } = usePricing(selectedStation?.id);
  const { data: products } = useProducts();
  const stationAlerts = useStationAlerts(selectedStation?.id, canSeeFinancials);
  const { data: expenses } = useExpenses({ enabled: canSeeFinancials });
  const { data: purchases } = usePurchases({ enabled: canSeeFinancials });
  const { data: collections } = useCollections({ enabled: canSeeFinancials });
  const { data: customers } = useCustomers(true, { enabled: canSeeFinancials });
  const { data: suppliers } = useSuppliers(true, { enabled: canSeeFinancials });
  const { data: users } = useUsers();
  const isOwner = userRole === 'Owner';
  // Live "Today's P&L" for the owner — recomputed on demand (no snapshot written).
  const pnlSettings: any = (selectedStation as any)?.settings || {};
  const pnlTodayBiz = resolveBusinessDate({
    timeZone: pnlSettings.timezone,
    dayStartsAt: pnlSettings.business_day_starts_at,
  });
  const { data: pnlPreview } = useDailyDssrPreview(selectedStation?.id, pnlTodayBiz, {
    enabled: isOwner && !!selectedStation?.id,
  } as any);
  const livePnl = pnlPreview?.snapshotData?.pnl || null;
  const pnlShiftsClosed = Number(pnlPreview?.snapshotData?.shiftsIncluded || 0);
  const invalidateOperational = useInvalidateOperational();
  const confirm = useConfirm();
  const toast = useToast();
  const [isReopening, setIsReopening] = useState(false);
  const [gsDismissed, setGsDismissed] = useState(() => {
    try {
      return localStorage.getItem('pumpos_gs_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const dismissGettingStarted = () => {
    try {
      localStorage.setItem('pumpos_gs_dismissed', '1');
    } catch {
      /* storage blocked */
    }
    setGsDismissed(true);
  };

  const handleReopen = async (shiftId: string) => {
    if (
      !(await confirm({
        title: 'Reopen this shift?',
        message:
          'This will delete the compiled Shift Summary and set the shift state back to OPEN. Reopening is allowed until the Business Day closes, provided no other shift is open.',
        confirmLabel: 'Reopen',
        danger: true,
      }))
    ) {
      return;
    }
    try {
      setIsReopening(true);
      await shiftService.reopenShift(shiftId);
      toast.success('Shift reopened.');
      await invalidateOperational(selectedStation?.id);
      onNavigate('/shifts');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reopen shift');
    } finally {
      setIsReopening(false);
    }
  };

  // Getting-started steps (data-driven; shared by the pre-ready hero and the
  // post-ready "Get started" checklist). Null-safe so a fresh org with NO
  // station yet still shows the hero. Customer/supplier steps only unlock once
  // the station is live (those screens are hidden pre-ready).
  const isReadyStation =
    !!selectedStation && (selectedStation as any).onboardingStatus === 'READY_FOR_OPERATIONS';
  const stationInProgress =
    !!selectedStation && (selectedStation as any).onboardingStatus === 'IN_PROGRESS';
  const canManageOnboarding = canOnboardStation(userRole);
  const gsSteps: ChecklistStep[] = [
    {
      id: 'org',
      label: 'Create your organization',
      description: 'Your account and organization are set up.',
      done: true,
      actionLabel: 'Done',
      onAction: () => {},
    },
    {
      id: 'station',
      label: 'Onboard your station',
      description: 'Set up fuels, tanks, dispensers and opening values.',
      done: isReadyStation,
      actionLabel: stationInProgress ? 'Resume' : 'Onboard',
      onAction: () => onNavigate('/onboarding'),
    },
    {
      id: 'team',
      label: 'Invite your team',
      description: 'Add managers and staff so they can log in.',
      done: (users?.length ?? 0) > 1,
      actionLabel: 'Invite',
      onAction: () => onNavigate('/organization'),
    },
    {
      id: 'suppliers',
      label: 'Add suppliers',
      description: 'Record fuel and merchandise suppliers.',
      done: (suppliers?.length ?? 0) > 0,
      locked: !isReadyStation,
      lockedHint: 'Available once your station is live.',
      actionLabel: 'Add',
      onAction: () => onNavigate('/purchases'),
    },
    {
      id: 'customers',
      label: 'Add customers',
      description: 'Track credit customers and fleet accounts.',
      done: (customers?.length ?? 0) > 0,
      locked: !isReadyStation,
      lockedHint: 'Available once your station is live.',
      actionLabel: 'Add',
      onAction: () => onNavigate('/customers', { open: 'new-customer' }),
    },
  ];

  // No station yet OR a station that isn't operational → native getting-started
  // hero on the dashboard (home). Owner/Manager can act on it; other roles just
  // wait for the Owner to finish setup.
  if (!isReadyStation) {
    if (!canManageOnboarding) {
      return (
        <div className="animate-fade-in flex flex-col gap-5">
          <PageHeader title="Dashboard" />
          <EmptyState
            icon={<TriangleAlert />}
            title={STATION_SETUP_IN_PROGRESS.title}
            description={STATION_SETUP_IN_PROGRESS.description}
          />
        </div>
      );
    }
    const firstName = (userName || '').trim().split(/\s+/)[0] || 'there';
    const subtitle = selectedStation
      ? `${selectedStation.name} · ${selectedStation.code}`
      : undefined;
    return (
      <div className="animate-fade-in flex flex-col gap-5">
        <PageHeader title="Dashboard" subtitle={subtitle} />
        <div
          className="card card-default"
          style={{
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>
              Welcome, {firstName}
            </span>
            <span
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
                maxWidth: '620px',
              }}
            >
              {stationInProgress
                ? 'Your station setup is in progress. Pick up where you left off to bring it online.'
                : 'Bring your station online to unlock shifts, sales, inventory and reports. Setup takes a few minutes and is done right here.'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Fuel size={14} />}
              onClick={() => onNavigate('/onboarding')}
            >
              {stationInProgress ? 'Resume setup' : 'Onboard your station'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Users size={14} />}
              onClick={() => onNavigate('/organization')}
            >
              Invite your team
            </Button>
          </div>
        </div>
        <GettingStartedChecklist steps={gsSteps} />
      </div>
    );
  }

  // Past this point the station is operational — narrow for TypeScript.
  if (!selectedStation) return null;

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col gap-5">
        <PageHeader
          title="Dashboard"
          subtitle={`${selectedStation.name} · ${selectedStation.code}`}
        />
        <SkeletonGrid count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in flex flex-col gap-5">
        <PageHeader
          title="Dashboard"
          subtitle={`${selectedStation.name} · ${selectedStation.code}`}
        />
        <Panel title="Couldn't load the dashboard">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {error.message || 'Failed to retrieve the active shift status.'}
            </p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  const { activeShift, lastShift, lastShiftSummary, canReopenLastShift, gracePeriodExpiresAt } =
    summary || {};
  const isAccountant = userRole === 'Accountant';

  // A freshly-onboarded (but ready) station: show the getting-started checklist
  // until the essentials are done or the user dismisses it. Reuses
  // `canManageOnboarding` rather than recomputing it — the checklist's primary
  // step routes into the wizard, so it is the same decision, not a similar one.
  const showGettingStarted = canManageOnboarding && !gsDismissed && gsSteps.some((s) => !s.done);

  // Business-day-aware "today so far" rollups (client-summed; timezone honoured).
  const stationSettings: any = (selectedStation as any).settings || {};
  const timeZone: string | undefined = stationSettings.timezone;
  const dayStartsAt: string | undefined = stationSettings.business_day_starts_at;
  const todayBiz = resolveBusinessDate({ timeZone, dayStartsAt });
  // The active shift's own business date, which is not necessarily today: a
  // shift opened on a past (still-open) business day stays anchored to it.
  const activeShiftBusinessDate: string | null = activeShift?.businessDate ?? null;
  const heroBusinessDate = activeShiftBusinessDate ?? todayBiz;
  const shiftOnPastDay = !!activeShiftBusinessDate && activeShiftBusinessDate !== todayBiz;

  const sumToday = (rows: any[] | undefined) =>
    (rows || [])
      .filter(
        (r) =>
          (r.businessDate ?? r.shiftDate) === todayBiz &&
          (r.stationId ? r.stationId === selectedStation.id : true),
      )
      .reduce((s, r) => s + Number(r.amount || 0), 0);
  // Office records (ADR 0005) are dated by the station calendar date, not the sales day.
  const todayEntry = resolveEntryDate({ timeZone });
  const sumTodayEntry = (rows: any[] | undefined) =>
    (rows || [])
      .filter(
        (r) =>
          r.entryDate === todayEntry && (r.stationId ? r.stationId === selectedStation.id : true),
      )
      .reduce((s, r) => s + Number(r.amount || 0), 0);
  const todayCollections = sumTodayEntry(collections);
  const todayExpenses = sumTodayEntry(expenses);
  const todayPurchases = sumToday(purchases);
  const receivables = (customers || []).reduce(
    (s: number, c: any) => s + Math.max(0, Number(c.currentBalance || 0)),
    0,
  );
  const payables = (suppliers || []).reduce(
    (s: number, x: any) => s + Math.max(0, Number(x.currentBalance || 0)),
    0,
  );
  // EOD-cycle customers whose receivable is expected cleared by day close.
  const eodDueCustomers = (customers || []).filter(
    (c: any) => c.settlementCycle === 'EOD' && Number(c.currentBalance || 0) > 0,
  );
  const eodDue = eodDueCustomers.reduce(
    (s: number, c: any) => s + Number(c.currentBalance || 0),
    0,
  );

  // Fuel sales today come from the immutable closed-shift summary snapshots,
  // aggregated server-side by business day (the dashboard-summary rollup).
  const today = summary?.today || {};
  const todayShiftsClosed = Number(today.shiftsClosed || 0);
  const todayFuelSales = Number(today.fuelSalesValue || 0);
  const todayVolume = Number(today.volume || 0);
  const todayCashVariance = Number(today.cashVariance || 0);

  const tankRows: any[] = tanks || [];
  // Only fuel products carry a per-litre pump price; exclude merchandise.
  const fuelProductIds = new Set(
    (products || []).filter((p: any) => p.productType === 'FUEL').map((p: any) => p.id),
  );
  const priceRows: any[] = (prices || []).filter(
    (cp: any) => fuelProductIds.size === 0 || fuelProductIds.has(cp.productId),
  );

  // Prioritized "needs attention" list: shared station alerts (stock / oversold,
  // same source as the top-bar bell) + today's cash variance.
  type Exception = {
    id: string;
    tone: 'danger' | 'warning' | 'info';
    title: string;
    meta?: string;
    onAction?: () => void;
  };
  const exceptions: Exception[] = [
    ...stationAlerts.map((a) => ({
      id: a.id,
      tone: a.severity,
      title: a.title,
      meta: a.meta,
      onAction: a.actionPath
        ? () =>
            onNavigate(
              a.actionPath!,
              a.actionTab
                ? { focusInventoryTab: a.actionTab, focusInventoryId: a.actionEntityId }
                : undefined,
            )
        : undefined,
    })),
    ...(canSeeFinancials && Math.abs(todayCashVariance) > 100
      ? [
          {
            id: 'variance',
            tone: 'danger' as const,
            title: 'Cash variance today',
            meta: `${inr(todayCashVariance)} across ${todayShiftsClosed} shift${todayShiftsClosed === 1 ? '' : 's'}`,
            onAction: () => onNavigate('/shifts'),
          },
        ]
      : []),
  ];

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        subtitle={`${selectedStation.name} · ${selectedStation.code}`}
        meta={
          <>
            <StatusChip
              status={activeShift ? 'open' : 'closed'}
              size="xs"
              label={activeShift ? 'Shift open' : 'No active shift'}
            />
            {/* The open shift may belong to a *past* business day (a day is
                closed independently of today), so label it with the shift's own
                business date — never today's. */}
            <Chip tone={shiftOnPastDay ? 'warning' : 'neutral'} size="xs">
              Business day {heroBusinessDate}
              {shiftOnPastDay ? ' · past day' : ''}
            </Chip>
          </>
        }
      />

      {/* Get started — progressive checklist until the essentials are done. */}
      {showGettingStarted && (
        <GettingStartedChecklist steps={gsSteps} dismissible onDismiss={dismissGettingStarted} />
      )}

      {/* Needs attention — shared station alerts + variance (financial roles) */}
      {/* Needs attention — collapsible; compact by default so many alerts
          never dominate the page. Expand to work through the list. */}
      {canSeeFinancials &&
        (exceptions.length === 0 ? (
          <EmptyState
            compact
            icon={<CircleCheckBig />}
            title="All clear"
            description="No variance, low stock, or oversold items right now."
          />
        ) : (
          <Panel
            title="Needs attention"
            icon={<AlertTriangle />}
            action={
              <Chip
                tone={exceptions.some((e) => e.tone === 'danger') ? 'danger' : 'warning'}
                size="xs"
              >
                {exceptions.length} to review
              </Chip>
            }
            collapsible
            defaultCollapsed
            flush
          >
            <ul className="max-h-[280px] divide-y divide-border-soft overflow-y-auto">
              {exceptions.map((e) => {
                const bg =
                  e.tone === 'danger'
                    ? 'bg-danger-bg text-danger-fg'
                    : e.tone === 'warning'
                      ? 'bg-warning-bg text-warning-fg'
                      : 'bg-info-bg text-info-fg';
                return (
                  <li key={e.id}>
                    <button
                      onClick={e.onAction}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-alt"
                    >
                      <span
                        className={cn(
                          'inline-flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5',
                          bg,
                        )}
                        aria-hidden="true"
                      >
                        {e.tone === 'info' ? <Clock /> : <TriangleAlert />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink-strong">
                          {e.title}
                        </span>
                        {e.meta && (
                          <span className="block truncate text-[11.5px] text-ink-muted">
                            {e.meta}
                          </span>
                        )}
                      </span>
                      {e.onAction && <ChevronRight className="size-4 shrink-0 text-ink-faint" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}

      {/* Shift operations + latest DSSR */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Active shift */}
        <Panel
          title="Shift operations"
          icon={<ClipboardList />}
          action={
            <StatusChip
              status={activeShift ? 'open' : 'closed'}
              size="xs"
              label={activeShift ? 'Active' : 'None'}
            />
          }
          footer={
            activeShift ? (
              <Button
                variant="primary"
                size="sm"
                fullWidth
                leftIcon={<Play />}
                onClick={() => onNavigate('/shifts')}
              >
                Resume shift workspace
              </Button>
            ) : (
              <Button
                variant={isAccountant ? 'secondary' : 'primary'}
                size="sm"
                fullWidth
                leftIcon={isAccountant ? <Lock /> : <Plus />}
                disabled={isAccountant}
                onClick={() => onNavigate('/shifts')}
              >
                {isAccountant ? 'Accountants cannot open shifts' : 'Open shift'}
              </Button>
            )
          }
        >
          {activeShift ? (
            <div>
              <div className="text-[15px] font-semibold text-ink-strong">
                {activeShift.templateName} Shift
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">
                Opened by {activeShift.openedByName} ·{' '}
                {new Date(activeShift.openedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="mt-3 text-[13px] text-ink-default">
                Opening cash{' '}
                <span className="font-mono font-semibold text-ink-strong">
                  {inr(activeShift.openingCash)}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[14px] font-semibold text-ink-strong">
                Ready to record operations
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">
                Start a shift to record nozzle readings and assign staff.
              </div>
            </div>
          )}
        </Panel>

        {/* Last closed shift — its shift-close summary (NOT a DSSR, which is
            the business-day-close snapshot). Financial roles only. */}
        {canSeeFinancials && (
          <Panel
            title="Last closed shift"
            icon={<FileText />}
            action={
              lastShift ? (
                <StatusChip
                  status={lastShift.status === 'LOCKED' ? 'locked' : 'closed'}
                  size="xs"
                />
              ) : undefined
            }
            footer={
              lastShift ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<FileText />}
                    className="flex-1"
                    onClick={() => onNavigate('/shifts', { openShiftSummaryId: lastShift.id })}
                  >
                    View shift summary
                  </Button>
                  {canReopenLastShift && (
                    <Button
                      variant="danger"
                      size="sm"
                      leftIcon={<Unlock />}
                      loading={isReopening}
                      className="flex-1"
                      onClick={() => handleReopen(lastShift.id)}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              ) : undefined
            }
          >
            {lastShift ? (
              <div>
                <div className="text-[14px] font-semibold text-ink-strong">
                  Last {lastShift.templateName} shift
                </div>
                <div className="mt-0.5 text-[12px] text-ink-muted">
                  Closed{' '}
                  {new Date(lastShift.closedAt).toLocaleString([], {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </div>
                {lastShiftSummary && (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                    <div className="text-ink-muted">
                      Fuel sold
                      <span className="mt-0.5 block font-mono font-semibold text-ink-strong">
                        {(() => {
                          const units: string[] = lastShiftSummary.fuelUnits || [];
                          const label = units.length === 1 ? units[0] : units.length > 1 ? '' : 'L';
                          return `${Number(lastShiftSummary.totalVolumeSold || 0).toFixed(2)}${label ? ` ${label}` : ''}`;
                        })()}
                      </span>
                    </div>
                    <div className="text-ink-muted">
                      Closing cash
                      <span className="mt-0.5 block font-mono font-semibold text-ink-strong">
                        {inr(lastShiftSummary.closingCash)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<FileText />}
                title="No closed shifts yet"
                description="Close a shift to compile its summary."
              />
            )}
          </Panel>
        )}
      </div>

      {/* Tank levels + fuel prices (all roles) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Tank levels" icon={<Droplet />}>
          {tankRows.length === 0 ? (
            <EmptyState compact icon={<Droplet />} title="No tank data yet" />
          ) : (
            <div className="space-y-3.5">
              {tankRows.map((tank) => {
                const cap = Number(tank.capacity) || 0;
                const vol = Number(tank.currentVolume) || 0;
                const pct = tankPct(vol, cap);
                const isOver = classifyTank(pct) === 'over';
                return (
                  <div key={tank.id} className="space-y-1">
                    <MeterRow
                      label={tank.name}
                      sublabel={tank.productName}
                      value={Math.min(vol, cap)}
                      max={cap}
                      tone={isOver ? 'info' : 'auto'}
                      valueLabel={`${formatQty(vol, 0)} / ${formatQty(cap, 0)} ${tank.productUnit || 'L'}${isOver ? ` · ${pct.toFixed(0)}%` : ''}`}
                    />
                    {isOver && (
                      <p className="m-0 text-[11px] leading-[1.45] text-info-fg">
                        Book stock over capacity. {OVER_CAPACITY_EXPLANATION}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Current fuel prices" icon={<Droplet />}>
          {priceRows.length === 0 ? (
            <EmptyState compact icon={<Droplet />} title="No pricing set" />
          ) : (
            <div className="space-y-2">
              {priceRows.map((cp) => (
                <div
                  key={cp.productId}
                  className="flex items-center justify-between rounded-input bg-surface-alt px-2.5 py-2"
                >
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-strong">
                    <Droplet className="size-3.5 text-brand-secondary" /> {cp.productName}
                  </span>
                  <span className="font-mono text-[13px] font-semibold text-ink-strong">
                    {inr(cp.price)}/
                    {tankRows.find((t) => t.productId === cp.productId)?.productUnit || 'L'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Live Today's P&L — Owner only */}
      {isOwner && livePnl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            Today&apos;s P&amp;L{' '}
            <span
              style={{
                fontSize: '9px',
                color: 'var(--brand-warning)',
                border: '1px solid var(--brand-warning)',
                borderRadius: '4px',
                padding: '0 5px',
                fontWeight: 700,
              }}
            >
              LIVE
            </span>
          </span>
          <KpiStrip columns={3}>
            <KpiTile dot="brand" label="Revenue Today" value={inr(Number(livePnl.revenue || 0))} />
            <KpiTile
              dot="success"
              valueTone="success"
              label="Gross Margin Today"
              value={inr(Number(livePnl.grossMargin || 0))}
            />
            <KpiTile
              dot="warning"
              label="COGS Today"
              value={inr(Number(livePnl.cogs || 0))}
              hint="Weighted-average cost"
            />
          </KpiStrip>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Provisional — {pnlShiftsClosed} shift{pnlShiftsClosed === 1 ? '' : 's'} closed today +
            live merchandise. Expenses and income are in the Daily Cash Book.
            {activeShift
              ? " The open shift's fuel is added when it closes."
              : ' Fuel is counted as each shift closes.'}
          </div>
        </div>
      )}

      {/* Financial rollup — Owner / Manager / Accountant only */}
      {canSeeFinancials && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Today's Financials
          </span>
          <KpiStrip>
            <KpiTile
              dot="success"
              valueTone="success"
              label="Fuel Sales Today"
              value={inr(todayFuelSales)}
              hint={`${formatQty(todayVolume)} L · closed shifts`}
            />
            <KpiTile dot="brand" label="Collections Today" value={inr(todayCollections)} />
            <KpiTile
              dot="danger"
              valueTone="danger"
              label="Expenses Today"
              value={inr(todayExpenses)}
            />
            <KpiTile dot="brand" label="Purchases Today" value={inr(todayPurchases)} />
            <KpiTile
              dot="warning"
              valueTone="warning"
              label="Receivables"
              value={inr(receivables)}
              hint="Customer dues"
            />
            {eodDue > 0 && (
              <KpiTile
                dot="danger"
                valueTone="danger"
                label="EOD collections due"
                value={inr(eodDue)}
                hint={`${eodDueCustomers.length} customer${eodDueCustomers.length === 1 ? '' : 's'} · clear by day close`}
              />
            )}
            <KpiTile dot="neutral" label="Payables" value={inr(payables)} hint="Supplier dues" />
          </KpiStrip>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Today ({todayBiz}): {todayShiftsClosed} shift{todayShiftsClosed === 1 ? '' : 's'} closed
            {todayShiftsClosed > 0 && (
              <>
                {' '}
                · net cash variance{' '}
                <strong
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color:
                      Math.abs(todayCashVariance) > 100
                        ? 'var(--brand-danger)'
                        : 'var(--text-default)',
                  }}
                >
                  {inr(todayCashVariance)}
                </strong>
              </>
            )}
          </div>
        </div>
      )}

      {/* Recommended correction window. The server permits reopening until day close. */}
      {gracePeriodExpiresAt && canReopenLastShift && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface-alt)',
            border: '1px solid var(--border-soft)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            color: 'var(--text-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span>
            <AlertTriangle
              size={14}
              style={{
                color: 'var(--state-warning-fg)',
                marginRight: '6px',
                verticalAlign: 'middle',
                display: 'inline',
              }}
            />{' '}
            <strong>Quick correction window:</strong> For the simplest handover, review and reopen
            by{' '}
            <strong>
              {new Date(gracePeriodExpiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </strong>
            .
          </span>
          <span
            style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            Reopen remains available until day close
          </span>
        </div>
      )}
    </div>
  );
};
