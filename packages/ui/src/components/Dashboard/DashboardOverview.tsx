import React, { useState } from 'react';
import { CloudShiftService } from '../../services/cloud.js';
import {
  useShiftStatus, useInvalidateOperational, useInventoryStatus, usePricing, useProducts,
  useExpenses, usePurchases, useCollections, useCustomers, useSuppliers, useShiftSummaries, useDailyDssrPreview, useUsers,
} from '../../query/hooks.js';
import { useStationAlerts } from '../../query/useStationAlerts.js';
import { SkeletonGrid } from '../primitives/Skeleton.js';
import { GettingStartedChecklist, type ChecklistStep } from './GettingStartedChecklist.js';
import {
  KpiStrip, KpiTile, Button, PageHeader, Panel, EmptyState, MeterRow, StatusChip, Chip,
} from '../../pump-ds/index.js';
import { cn } from '../../pump-ds/lib/cn.js';
import { inr, formatQty } from '../../utils/format.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useToast } from '../primitives/ToastProvider.js';
import { Station, resolveBusinessDate } from '@pump/shared';
import type { NavIntent } from '../AppShell.js';
import {
  Play, Plus, FileText, Unlock, AlertTriangle, Lock, Droplet, ClipboardList,
  CircleCheckBig, ChevronRight, TriangleAlert, Clock, Fuel, Users,
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
  const { data: summary, isLoading: loading, error, refetch } = useShiftStatus(selectedStation?.id);
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
  const { data: shiftSummaries } = useShiftSummaries(selectedStation?.id, { enabled: canSeeFinancials });
  const isOwner = userRole === 'Owner';
  // Live "Today's P&L" for the owner — recomputed on demand (no snapshot written).
  const pnlSettings: any = (selectedStation as any)?.settings || {};
  const pnlTodayBiz = resolveBusinessDate({ timeZone: pnlSettings.timezone, dayStartsAt: pnlSettings.business_day_starts_at });
  const { data: pnlPreview } = useDailyDssrPreview(selectedStation?.id, pnlTodayBiz, { enabled: isOwner && !!selectedStation?.id } as any);
  const livePnl = (pnlPreview as any)?.snapshotData?.pnl || null;
  const pnlShiftsClosed = Number((pnlPreview as any)?.snapshotData?.shiftsIncluded || 0);
  const invalidateOperational = useInvalidateOperational();
  const confirm = useConfirm();
  const toast = useToast();
  const [isReopening, setIsReopening] = useState(false);
  const [gsDismissed, setGsDismissed] = useState(() => {
    try { return localStorage.getItem('pumpos_gs_dismissed') === '1'; } catch { return false; }
  });
  const dismissGettingStarted = () => {
    try { localStorage.setItem('pumpos_gs_dismissed', '1'); } catch { /* storage blocked */ }
    setGsDismissed(true);
  };

  const handleReopen = async (shiftId: string) => {
    if (!(await confirm({
      title: 'Reopen this shift?',
      message: 'This will delete the generated DSSR snapshot and set the shift state back to OPEN.',
      confirmLabel: 'Reopen',
      danger: true,
    }))) {
      return;
    }
    try {
      setIsReopening(true);
      await shiftService.reopenShift(shiftId);
      invalidateOperational(selectedStation?.id);
      toast.success('Shift reopened.');
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
  const isReadyStation = !!selectedStation && (selectedStation as any).onboardingStatus === 'READY_FOR_OPERATIONS';
  const stationInProgress = !!selectedStation && (selectedStation as any).onboardingStatus === 'IN_PROGRESS';
  const canManageOnboarding = userRole === 'Owner' || userRole === 'Manager';
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
            title="Station setup in progress"
            description="Operations unlock automatically once the Owner completes onboarding."
          />
        </div>
      );
    }
    const firstName = (userName || '').trim().split(/\s+/)[0] || 'there';
    const subtitle = selectedStation ? `${selectedStation.name} · ${selectedStation.code}` : undefined;
    return (
      <div className="animate-fade-in flex flex-col gap-5">
        <PageHeader title="Dashboard" subtitle={subtitle} />
        <div
          className="card card-default"
          style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)' }}>Welcome, {firstName}</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '620px' }}>
              {stationInProgress
                ? 'Your station setup is in progress. Pick up where you left off to bring it online.'
                : 'Bring your station online to unlock shifts, sales, inventory and reports. Setup takes a few minutes and is done right here.'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Button variant="primary" size="sm" leftIcon={<Fuel size={14} />} onClick={() => onNavigate('/onboarding')}>
              {stationInProgress ? 'Resume setup' : 'Onboard your station'}
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<Users size={14} />} onClick={() => onNavigate('/organization')}>
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
        <PageHeader title="Dashboard" subtitle={`${selectedStation.name} · ${selectedStation.code}`} />
        <SkeletonGrid count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in flex flex-col gap-5">
        <PageHeader title="Dashboard" subtitle={`${selectedStation.name} · ${selectedStation.code}`} />
        <Panel title="Couldn't load the dashboard">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{error.message || 'Failed to retrieve the active shift status.'}</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        </Panel>
      </div>
    );
  }

  const { activeShift, lastShift, lastDssr, canReopenLastShift, gracePeriodExpiresAt } = summary || {};
  const isAccountant = userRole === 'Accountant';

  // A freshly-onboarded (but ready) station: show the getting-started checklist
  // until the essentials are done or the user dismisses it.
  const canManage = userRole === 'Owner' || userRole === 'Manager';
  const showGettingStarted = canManage && !gsDismissed && gsSteps.some((s) => !s.done);

  // Business-day-aware "today so far" rollups (client-summed; timezone honoured).
  const stationSettings: any = (selectedStation as any).settings || {};
  const timeZone: string | undefined = stationSettings.timezone;
  const dayStartsAt: string | undefined = stationSettings.business_day_starts_at;
  const todayBiz = resolveBusinessDate({ timeZone, dayStartsAt });

  const sumToday = (rows: any[] | undefined) =>
    (rows || [])
      .filter((r) => (r.businessDate ?? r.shiftDate) === todayBiz && (r.stationId ? r.stationId === selectedStation.id : true))
      .reduce((s, r) => s + Number(r.amount || 0), 0);
  const todayCollections = sumToday(collections);
  const todayExpenses = sumToday(expenses);
  const todayPurchases = sumToday(purchases);
  const receivables = (customers || []).reduce((s: number, c: any) => s + Math.max(0, Number(c.currentBalance || 0)), 0);
  const payables = (suppliers || []).reduce((s: number, x: any) => s + Math.max(0, Number(x.currentBalance || 0)), 0);
  // EOD-cycle customers whose receivable is expected cleared by day close.
  const eodDueCustomers = (customers || []).filter(
    (c: any) => c.settlementCycle === 'EOD' && Number(c.currentBalance || 0) > 0,
  );
  const eodDue = eodDueCustomers.reduce((s: number, c: any) => s + Number(c.currentBalance || 0), 0);

  // Fuel sales today come from the immutable closed-shift summary snapshots
  // (each shift's business day is resolved from its open instant).
  const todayShifts = (shiftSummaries || []).filter(
    (s: any) => resolveBusinessDate({ now: new Date(s.openedAt), timeZone, dayStartsAt }) === todayBiz,
  );
  const todayFuelSales = todayShifts.reduce((sum: number, s: any) => sum + Number(s.snapshotData?.totalFuelSalesValue || 0), 0);
  const todayVolume = todayShifts.reduce((sum: number, s: any) => sum + Number(s.snapshotData?.totalVolume || 0), 0);
  const todayCashVariance = todayShifts.reduce((sum: number, s: any) => sum + Number(s.snapshotData?.cashVariance || 0), 0);

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
  type Exception = { id: string; tone: 'danger' | 'warning' | 'info'; title: string; meta?: string; onAction?: () => void };
  const exceptions: Exception[] = [
    ...stationAlerts.map((a) => ({
      id: a.id, tone: a.severity, title: a.title, meta: a.meta,
      onAction: a.actionPath
        ? () => onNavigate(a.actionPath!, a.actionTab ? { focusInventoryTab: a.actionTab, focusInventoryId: a.actionEntityId } : undefined)
        : undefined,
    })),
    ...(canSeeFinancials && Math.abs(todayCashVariance) > 100
      ? [{
          id: 'variance', tone: 'danger' as const,
          title: 'Cash variance today',
          meta: `${inr(todayCashVariance)} across ${todayShifts.length} shift${todayShifts.length === 1 ? '' : 's'}`,
          onAction: () => onNavigate('/shifts'),
        }]
      : []),
  ];

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        subtitle={`${selectedStation.name} · ${selectedStation.code}`}
        meta={
          <>
            <StatusChip status={activeShift ? 'open' : 'closed'} size="xs" label={activeShift ? 'Shift open' : 'No active shift'} />
            <Chip tone="neutral" size="xs">Business day {todayBiz}</Chip>
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
      {canSeeFinancials && (
        exceptions.length === 0 ? (
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
              <Chip tone={exceptions.some((e) => e.tone === 'danger') ? 'danger' : 'warning'} size="xs">
                {exceptions.length} to review
              </Chip>
            }
            collapsible
            defaultCollapsed
            flush
          >
            <ul className="max-h-[280px] divide-y divide-border-soft overflow-y-auto">
              {exceptions.map((e) => {
                const bg = e.tone === 'danger' ? 'bg-danger-bg text-danger-fg' : e.tone === 'warning' ? 'bg-warning-bg text-warning-fg' : 'bg-info-bg text-info-fg';
                return (
                  <li key={e.id}>
                    <button onClick={e.onAction} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-alt">
                      <span className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5', bg)} aria-hidden="true">
                        {e.tone === 'info' ? <Clock /> : <TriangleAlert />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink-strong">{e.title}</span>
                        {e.meta && <span className="block truncate text-[11.5px] text-ink-muted">{e.meta}</span>}
                      </span>
                      {e.onAction && <ChevronRight className="size-4 shrink-0 text-ink-faint" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )
      )}

      {/* Shift operations + latest DSSR */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Active shift */}
        <Panel
          title="Shift operations"
          icon={<ClipboardList />}
          action={<StatusChip status={activeShift ? 'open' : 'closed'} size="xs" label={activeShift ? 'Active' : 'None'} />}
          footer={
            activeShift ? (
              <Button variant="primary" size="sm" fullWidth leftIcon={<Play />} onClick={() => onNavigate('/shifts')}>Resume shift workspace</Button>
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
              <div className="text-[15px] font-semibold text-ink-strong">{activeShift.templateName} Shift</div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">
                Opened by {activeShift.openedByName} · {new Date(activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="mt-3 text-[13px] text-ink-default">
                Opening cash <span className="font-mono font-semibold text-ink-strong">{inr(activeShift.openingCash)}</span>
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[14px] font-semibold text-ink-strong">Ready to record operations</div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">Start a shift to record nozzle readings and assign staff.</div>
            </div>
          )}
        </Panel>

        {/* Latest DSSR — financial roles */}
        {canSeeFinancials && (
          <Panel
            title="Latest DSSR"
            icon={<FileText />}
            action={lastShift ? <StatusChip status={lastShift.status === 'LOCKED' ? 'locked' : 'closed'} size="xs" /> : undefined}
            footer={
              lastShift ? (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" leftIcon={<FileText />} className="flex-1" onClick={() => onNavigate('/shifts')}>View last DSSR</Button>
                  {canReopenLastShift && (
                    <Button variant="danger" size="sm" leftIcon={<Unlock />} loading={isReopening} className="flex-1" onClick={() => handleReopen(lastShift.id)}>Reopen</Button>
                  )}
                </div>
              ) : undefined
            }
          >
            {lastShift ? (
              <div>
                <div className="text-[14px] font-semibold text-ink-strong">Last {lastShift.templateName} shift</div>
                <div className="mt-0.5 text-[12px] text-ink-muted">
                  Closed {new Date(lastShift.closedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </div>
                {lastDssr && (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                    <div className="text-ink-muted">Fuel sold<span className="mt-0.5 block font-mono font-semibold text-ink-strong">{(() => {
                      const snap = lastDssr.snapshotData || {};
                      const units = Array.from(new Set((snap.fuelByProduct || []).map((p: any) => p.unit || 'L')));
                      const label = units.length === 1 ? units[0] : units.length > 1 ? '' : 'L';
                      return `${Number(snap.totalVolumeSold || 0).toFixed(2)}${label ? ` ${label}` : ''}`;
                    })()}</span></div>
                    <div className="text-ink-muted">Closing cash<span className="mt-0.5 block font-mono font-semibold text-ink-strong">{inr(lastDssr.snapshotData.closingCash)}</span></div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState compact icon={<FileText />} title="No reports yet" description="Close a shift to compile its DSSR." />
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
                return (
                  <MeterRow
                    key={tank.id}
                    label={tank.name}
                    sublabel={tank.productName}
                    value={vol}
                    max={cap}
                    valueLabel={`${formatQty(vol, 0)} / ${formatQty(cap, 0)} ${tank.productUnit || 'L'}`}
                  />
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
                <div key={cp.productId} className="flex items-center justify-between rounded-input bg-surface-alt px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-strong">
                    <Droplet className="size-3.5 text-brand-secondary" /> {cp.productName}
                  </span>
                  <span className="font-mono text-[13px] font-semibold text-ink-strong">{inr(cp.price)}/{tankRows.find((t) => t.productId === cp.productId)?.productUnit || 'L'}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Live Today's P&L — Owner only */}
      {isOwner && livePnl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', gap: '8px', alignItems: 'center' }}>
            Today&apos;s P&amp;L <span style={{ fontSize: '9px', color: 'var(--brand-warning)', border: '1px solid var(--brand-warning)', borderRadius: '4px', padding: '0 5px', fontWeight: 700 }}>LIVE</span>
          </span>
          <KpiStrip columns={3}>
            <KpiTile dot="brand" label="Revenue Today" value={inr(Number(livePnl.revenue || 0))} />
            <KpiTile dot="success" valueTone="success" label="Gross Margin Today" value={inr(Number(livePnl.grossMargin || 0))} />
            <KpiTile
              dot={Number(livePnl.netProfit || 0) < 0 ? 'danger' : 'success'}
              valueTone={Number(livePnl.netProfit || 0) < 0 ? 'danger' : 'success'}
              label="Net Profit Today"
              value={inr(Number(livePnl.netProfit || 0))}
              hint="After COGS & expenses"
            />
          </KpiStrip>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Provisional — {pnlShiftsClosed} shift{pnlShiftsClosed === 1 ? '' : 's'} closed today + live merchandise &amp; expenses.
            {activeShift
              ? " The open shift's fuel is added when it closes."
              : ' Fuel is counted as each shift closes.'}
          </div>
        </div>
      )}

      {/* Financial rollup — Owner / Manager / Accountant only */}
      {canSeeFinancials && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Today's Financials
          </span>
          <KpiStrip>
            <KpiTile dot="success" valueTone="success" label="Fuel Sales Today" value={inr(todayFuelSales)} hint={`${formatQty(todayVolume)} L · closed shifts`} />
            <KpiTile dot="brand" label="Collections Today" value={inr(todayCollections)} />
            <KpiTile dot="danger" valueTone="danger" label="Expenses Today" value={inr(todayExpenses)} />
            <KpiTile dot="brand" label="Purchases Today" value={inr(todayPurchases)} />
            <KpiTile dot="warning" valueTone="warning" label="Receivables" value={inr(receivables)} hint="Customer dues" />
            {eodDue > 0 && (
              <KpiTile dot="danger" valueTone="danger" label="EOD collections due" value={inr(eodDue)} hint={`${eodDueCustomers.length} customer${eodDueCustomers.length === 1 ? '' : 's'} · clear by day close`} />
            )}
            <KpiTile dot="neutral" label="Payables" value={inr(payables)} hint="Supplier dues" />
          </KpiStrip>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Today ({todayBiz}): {todayShifts.length} shift{todayShifts.length === 1 ? '' : 's'} closed
            {todayShifts.length > 0 && <> · net cash variance <strong style={{ fontFamily: 'var(--font-mono)', color: Math.abs(todayCashVariance) > 100 ? 'var(--brand-danger)' : 'var(--text-default)' }}>{inr(todayCashVariance)}</strong></>}
          </div>
        </div>
      )}

      {/* Grace period remaining countdown notification */}
      {gracePeriodExpiresAt && canReopenLastShift && (
        <div style={{
          backgroundColor: 'var(--bg-surface-alt)',
          border: '1px solid var(--border-soft)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-input)',
          fontSize: '12px',
          color: 'var(--text-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <span>
            <AlertTriangle size={14} style={{ color: 'var(--state-warning-fg)', marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> <strong>Reopen Window Active:</strong> You can reopen the recently closed shift until{' '}
            <strong>{new Date(gracePeriodExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>.
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Grace Timer Running
          </span>
        </div>
      )}
    </div>
  );
};
