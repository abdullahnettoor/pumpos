import React, { useState } from 'react';
import { CloudShiftService } from '../../services/cloud.js';
import {
  useShiftStatus, useInvalidateOperational, useInventoryStatus, useInventoryItems, usePricing, useProducts,
  useExpenses, usePurchases, useCollections, useCustomers, useSuppliers, useShiftSummaries, useDailyDssrPreview,
} from '../../query/hooks.js';
import { StatusBadge } from '../StatusBadge.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { SkeletonGrid } from '../primitives/Skeleton.js';
import { KpiStrip, KpiTile, Button } from '../../pump-ds/index.js';
import { Banner } from '../primitives/Banner.js';
import { inr, formatQty } from '../../utils/format.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useToast } from '../primitives/ToastProvider.js';
import { Station, resolveBusinessDate } from '@pump/shared';
import { Play, Plus, FileText, Unlock, AlertTriangle, Lock, Droplet } from 'lucide-react';

const shiftService = new CloudShiftService();

interface DashboardOverviewProps {
  selectedStation: Station | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  userName: string;
  onNavigate: (path: string) => void;
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
  const { data: inventoryItems } = useInventoryItems(selectedStation?.id, { enabled: canSeeFinancials });
  const { data: expenses } = useExpenses({ enabled: canSeeFinancials });
  const { data: purchases } = usePurchases({ enabled: canSeeFinancials });
  const { data: collections } = useCollections({ enabled: canSeeFinancials });
  const { data: customers } = useCustomers(true, { enabled: canSeeFinancials });
  const { data: suppliers } = useSuppliers(true, { enabled: canSeeFinancials });
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

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', padding: '24px' }}>
        No station selected. Please configure or select a station to continue.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>Welcome back, {userName}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Station Control Center: <strong style={{ color: 'var(--text-default)' }}>{selectedStation.name}</strong> ({selectedStation.code})
          </p>
        </div>
        <SkeletonGrid count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: 'var(--state-danger-bg)',
        color: 'var(--state-danger-fg)',
        borderRadius: 'var(--radius-card)',
        fontFamily: 'var(--font-sans)',
        fontSize: '13px'
      }}>
        <strong>Error:</strong> {error.message || 'Failed to retrieve active shifts status'}
        <button
          onClick={() => refetch()}
          style={{
            display: 'block',
            marginTop: '12px',
            padding: '6px 12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-button)',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Retry Load
        </button>
      </div>
    );
  }

  const { activeShift, lastShift, lastDssr, canReopenLastShift, gracePeriodExpiresAt } = summary || {};
  const isAccountant = userRole === 'Accountant';

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
  const receivables = (customers || []).reduce((s: number, c: any) => s + Math.max(0, Number(c.balance || 0)), 0);
  const payables = (suppliers || []).reduce((s: number, x: any) => s + Math.max(0, Number(x.balance || 0)), 0);

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

  // Dashboard alerts (extensible). Low-stock warnings differ for fuel (% of
  // tank capacity) vs merchandise (out-of-stock / oversold). Gated to roles that
  // can act on inventory; each carries an action to the stock page.
  // Thresholds are sensible defaults — make them station-configurable later.
  type DashAlert = { id: string; severity: 'danger' | 'warning'; message: string; actionLabel: string; path: string };
  const alerts: DashAlert[] = [];
  if (canSeeFinancials) {
    tankRows.forEach((t) => {
      const cap = Number(t.capacity) || 0;
      const vol = Number(t.currentVolume) || 0;
      if (!cap) return;
      const pct = (vol / cap) * 100;
      if (pct < 5) {
        alerts.push({ id: `tank-${t.id}`, severity: 'danger', message: `${t.name} (${t.productName}) critically low — ${pct.toFixed(0)}% · ${formatQty(vol, 0)} L`, actionLabel: 'View Stock', path: '/inventory' });
      } else if (pct < 15) {
        alerts.push({ id: `tank-${t.id}`, severity: 'warning', message: `${t.name} (${t.productName}) running low — ${pct.toFixed(0)}% · ${formatQty(vol, 0)} L`, actionLabel: 'View Stock', path: '/inventory' });
      }
    });
    (inventoryItems || []).forEach((i: any) => {
      const q = Number(i.quantity) || 0;
      // Negative stock is a genuine anomaly (a sale recorded beyond on-hand).
      // Plain zero is NOT flagged — many products are simply not stocked.
      if (q < 0) {
        alerts.push({ id: `item-${i.productId}`, severity: 'danger', message: `${i.name} oversold — ${formatQty(q)} ${i.unit ?? ''}`.trim(), actionLabel: 'View Stock', path: '/inventory' });
      }
    });
    alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1));
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
      {/* Top Welcome Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Welcome back, {userName}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Station Control Center: <strong style={{ color: 'var(--text-default)' }}>{selectedStation.name}</strong> ({selectedStation.code})
          </p>
        </div>
      </div>

      {/* Alerts — role-gated actionable warnings (low stock, etc.) */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {alerts.map((a) => (
            <Banner key={a.id} severity={a.severity} actionLabel={a.actionLabel} onAction={() => onNavigate(a.path)}>
              {a.message}
            </Banner>
          ))}
        </div>
      )}

      {/* Main Grid: Launch Surfaces */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Active Shift Card */}
        <div className="card card-default" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px' }}>
          <div>
            <div className="flex justify-between items-center">
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Shift Operations
              </span>
              {activeShift ? (
                <StatusBadge status="ACTIVE" type="success" />
              ) : (
                <StatusBadge status="NO ACTIVE SHIFT" type="warning" />
              )}
            </div>

            {activeShift ? (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-strong)' }}>
                  {activeShift.templateName} Shift
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                  Opened by {activeShift.openedByName} at {new Date(activeShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
                  <span>Opening Cash: <strong>{inr(activeShift.openingCash)}</strong></span>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-default)' }}>
                  Ready to Record Operations
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                  Start a new shift template to record nozzle readings and assign staff.
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: '20px' }}>
            {activeShift ? (
              <Button variant="primary" size="md" fullWidth leftIcon={<Play />} onClick={() => onNavigate('/shifts')}>
                Resume Shift Workspace
              </Button>
            ) : (
              <Button
                variant={isAccountant ? 'secondary' : 'primary'}
                size="md"
                fullWidth
                leftIcon={isAccountant ? <Lock /> : <Plus />}
                disabled={isAccountant}
                onClick={() => onNavigate('/shifts')}
              >
                {isAccountant ? 'Accountants Cannot Open Shifts' : 'Open Shift'}
              </Button>
            )}
          </div>
        </div>

        {/* Latest DSSR Output Card — financial, non-Staff only */}
        {canSeeFinancials && (
        <div className="card card-default" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px' }}>
          <div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Authoritative Outputs (DSSR)
            </span>

            {lastShift ? (
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
                    Last {lastShift.templateName} Shift
                  </h3>
                  <StatusBadge status={lastShift.status} type={lastShift.status === 'LOCKED' ? 'default' : 'warning'} />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                  Closed at: {new Date(lastShift.closedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </p>

                {lastDssr && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: '12px', fontSize: '12px', color: 'var(--text-default)' }}>
                    <div>Total Fuel Sold: <strong>{Number(lastDssr.snapshotData.totalVolumeSold).toFixed(2)} L</strong></div>
                    <div>Closing Cash: <strong>{inr(lastDssr.snapshotData.closingCash)}</strong></div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  No historical reports yet
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                  Complete a shift closure to automatically compile the Daily Sales Summary Record.
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
            {lastShift && (
              <>
                <Button variant="secondary" size="sm" leftIcon={<FileText />} style={{ flex: 1 }} onClick={() => onNavigate('/shifts')}>
                  View Last DSSR
                </Button>

                {canReopenLastShift && (
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<Unlock />}
                    loading={isReopening}
                    style={{ flex: 1 }}
                    onClick={() => handleReopen(lastShift.id)}
                  >
                    Reopen
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        )}

      </div>

      {/* Fuel prices + tank levels (visible to all roles) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Tank levels */}
        <div className="card card-default" style={{ padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tank Levels
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
            {tankRows.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No tank data yet.</span>
            ) : tankRows.map((tank) => {
              const cap = Number(tank.capacity) || 0;
              const vol = Number(tank.currentVolume) || 0;
              const pct = cap ? Math.min(100, Math.max(0, (vol / cap) * 100)) : 0;
              const low = pct < 15;
              return (
                <div key={tank.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                    <span style={{ color: 'var(--text-strong)', fontWeight: 500 }}>
                      {tank.name} <span style={{ color: 'var(--text-faint)' }}>· {tank.productName}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: low ? 'var(--brand-danger)' : 'var(--text-muted)' }}>
                      {formatQty(vol, 0)} / {formatQty(cap, 0)} L
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-surface-alt)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: low ? 'var(--brand-danger)' : 'var(--brand-primary)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current fuel prices */}
        <div className="card card-default" style={{ padding: '16px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Current Fuel Prices
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
            {priceRows.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No pricing set.</span>
            ) : priceRows.map((cp) => (
              <div key={cp.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-surface-alt)', borderRadius: 'var(--radius-input)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Droplet size={13} style={{ color: 'var(--brand-secondary)' }} /> {cp.productName}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-strong)' }}>{inr(cp.price)}/L</span>
              </div>
            ))}
          </div>
        </div>
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
