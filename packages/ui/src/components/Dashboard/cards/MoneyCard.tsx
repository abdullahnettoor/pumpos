import React, { useMemo } from 'react';
import {
  comparisonView,
  deriveComparison,
  deriveSales,
  num,
  readSnapshot,
  shiftBusinessDate,
} from '@pump/shared';
import { formatBusinessDate, formatMoney, inr } from '../../../utils/format.js';
import { cashAccountTotals } from '../../../utils/cashBook.js';
import {
  useDailyCashBook,
  useDailyDssrPreview,
  useInsightsSales,
} from '../../../query/hooks.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import { DashboardCard } from '../frame/DashboardCard.js';

export function formatCompactRupees(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 100_000) {
    return `₹${(value / 100_000).toFixed(2)}L`;
  }
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/**
 * Money hero card: "Sales so far" + 14-day trend (#506).
 * Reuses the mobile Home headline rule/source:
 * - Fuel from closed Shifts only, plus live Product Sales
 * - When no shift closed yet: ₹0 with 'Fuel counts at shift close'
 * - Margin (Owner only), Credit, Cash in Hand
 * - 14-day trend: sealed days solid, draft days dashed, previous dotted, best day marked
 */
export const MoneyCard: React.FC = () => {
  const { station, role, businessDate, onNavigate } = useDashboard();
  const enabled = useCardEnabled('money');
  const canTrend = role === 'Owner' || role === 'Manager' || role === 'Accountant';
  const isOwner = role === 'Owner';

  const todayPreviewQ = useDailyDssrPreview(station.id, businessDate, { enabled });
  const prevDate = shiftBusinessDate(businessDate, -1);
  const prevPreviewQ = useDailyDssrPreview(station.id, prevDate, { enabled });
  const insightsQ = useInsightsSales(station.id, 14, { enabled: enabled && canTrend });
  const cashBookQ = useDailyCashBook(station.id, businessDate, { enabled });

  const todaySnap = useMemo(() => readSnapshot(todayPreviewQ.data), [todayPreviewQ.data]);
  const sales = useMemo(() => deriveSales(todaySnap), [todaySnap]);
  const hasClosedShift = sales.closedShifts.length > 0;

  const comparison = useMemo(() => {
    if (!hasClosedShift) return null;
    const prevSnap = readSnapshot(prevPreviewQ.data);
    return deriveComparison(sales, prevSnap, prevDate);
  }, [sales, prevPreviewQ.data, prevDate, hasClosedShift]);

  const compView = comparison ? comparisonView(comparison) : null;

  const margin = num(todaySnap.pnl?.grossMargin);
  const credit = num(todaySnap.credit?.total ?? todaySnap.settlements?.credit);
  const cashInHand = num(
    todaySnap.cashInHand ??
      todaySnap.cashInHandClosing ??
      cashBookQ.data?.accounts?.find((a) => a.accountType === 'CASH_IN_HAND')?.closing ??
      cashAccountTotals(cashBookQ.data?.accounts ?? []).closing,
  );

  const trendData = insightsQ.data;
  const showTrend = canTrend;
  const hasEnoughHistory = trendData && trendData.closedDays >= 3;

  // Chart coordinate calculation
  const chart = useMemo(() => {
    if (!trendData || !hasEnoughHistory) return null;
    const W = 320;
    const H = 70;
    const trend = trendData.trend ?? [];
    if (trend.length === 0) return null;

    const values = trend.map((d) => d.sales);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);

    const X = (i: number) => 2 + (i / Math.max(1, trend.length - 1)) * (W - 4);
    const Y = (v: number) => 6 + (1 - (v - min) / (max - min || 1)) * (H - 12);

    // Sealed days are closed; draft days are open
    const sealedCount = trend.filter((d) => d.closed).length;

    const pathFor = (from: number, to: number) =>
      trend
        .slice(from, to)
        .map((d, j) => `${j ? 'L' : 'M'}${X(from + j).toFixed(1)} ${Y(d.sales).toFixed(1)}`)
        .join(' ');

    const sealedLine = pathFor(0, sealedCount);
    const sealedArea =
      sealedCount > 0
        ? `${sealedLine} L${X(sealedCount - 1).toFixed(1)} ${H} L${X(0).toFixed(1)} ${H} Z`
        : '';

    const hasDraft = sealedCount < trend.length;
    const draftLine = hasDraft ? pathFor(Math.max(0, sealedCount - 1), trend.length) : '';

    // Previous 14 baseline / dotted curve
    const prevAvg = trendData.previousAverage ?? trendData.average;
    const prevY = Y(prevAvg).toFixed(1);
    const prevLine = `M${X(0).toFixed(1)} ${prevY} L${X(trend.length - 1).toFixed(1)} ${prevY}`;

    // Best day circle
    let bestIdx = -1;
    let bestVal = -1;
    trend.forEach((d, i) => {
      if (d.closed && d.sales > bestVal) {
        bestVal = d.sales;
        bestIdx = i;
      }
    });

    return {
      W,
      H,
      sealedLine,
      sealedArea,
      draftLine,
      prevLine,
      bestCircle:
        bestIdx >= 0 ? { cx: X(bestIdx).toFixed(1), cy: Y(bestVal).toFixed(1) } : null,
      fromLabel: trendData.range?.from ? formatBusinessDate(trendData.range.from) : '',
    };
  }, [trendData, hasEnoughHistory]);

  return (
    <DashboardCard
      card="money"
      title="Sales so far"
      query={todayPreviewQ}
      placeholderHeight={260}
    >
      <div className="flex flex-col gap-3">
        {!hasClosedShift ? (
          <div>
            <div
              className="text-2xl font-medium tracking-tight text-ink font-mono"
              data-testid="sales-headline"
            >
              ₹0
            </div>
            <div className="text-xs text-ink-muted mt-1">
              No shift has closed yet today. Fuel counts at shift close.
            </div>
          </div>
        ) : (
          <div>
            <div
              className="text-2xl font-medium tracking-tight text-ink font-mono"
              data-testid="sales-headline"
            >
              {formatMoney(sales.total, { decimals: 0 })}
            </div>
            <div className="text-xs text-ink-muted mt-0.5">
              <span className="font-mono">{sales.fuelVolumeLabel}</span> fuel (closed shifts) ·{' '}
              <span className="font-mono">{formatMoney(sales.productsValue, { decimals: 0 })}</span>{' '}
              products
            </div>
            {compView && (
              <div
                className={`text-xs mt-1 font-medium ${
                  compView.tone === 'bad' ? 'text-state-danger-fg' : 'text-ink'
                }`}
              >
                {compView.arrow ? `${compView.arrow} ` : ''}
                {compView.text}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-border-soft">
          {isOwner && (
            <div data-testid="margin-tile">
              <div className="text-[11px] uppercase tracking-wider text-ink-muted">Margin</div>
              <div className="font-mono text-sm font-medium text-state-success-fg">
                {formatCompactRupees(margin)}
              </div>
            </div>
          )}
          <div data-testid="credit-tile">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Credit</div>
            <div className="font-mono text-sm font-medium text-state-warning-fg">
              {formatCompactRupees(credit)}
            </div>
          </div>
          <div data-testid="cash-in-hand-tile">
            <div className="text-[11px] uppercase tracking-wider text-ink-muted">Cash in hand</div>
            <div className="font-mono text-sm font-medium text-ink">
              {formatCompactRupees(cashInHand)}
            </div>
          </div>
        </div>

        {showTrend && (
          <div className="pt-2.5 border-t border-border-soft">
            {!hasEnoughHistory ? (
              <div className="text-xs text-ink-muted">
                The 14-day trend appears once 3 business days are closed.
              </div>
            ) : (
              <div>
                <div className="flex items-center text-xs">
                  <span className="text-ink-muted">Last 14 days</span>
                  <span className="ml-2 text-ink">
                    avg <b className="font-mono font-medium">{formatCompactRupees(trendData.average)}</b>
                  </span>
                  {trendData.changePct !== null && (
                    <span
                      className={`ml-2 font-mono font-medium ${
                        trendData.changePct >= 0 ? 'text-state-success-fg' : 'text-state-danger-fg'
                      }`}
                    >
                      {trendData.changePct >= 0 ? '+' : ''}
                      {trendData.changePct}%
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate('/reports')}
                    className="ml-auto text-brand hover:underline font-medium"
                  >
                    Insights ›
                  </button>
                </div>

                {chart && (
                  <>
                    <svg
                      viewBox={`0 0 ${chart.W} ${chart.H}`}
                      width="100%"
                      height={chart.H}
                      preserveAspectRatio="none"
                      className="block mt-2 overflow-visible"
                    >
                      {chart.prevLine && (
                        <path
                          d={chart.prevLine}
                          fill="none"
                          stroke="currentColor"
                          className="text-ink-muted opacity-40"
                          strokeWidth="1.2"
                          strokeDasharray="2 3"
                        />
                      )}
                      {chart.sealedArea && (
                        <path
                          d={chart.sealedArea}
                          fill="currentColor"
                          className="text-brand opacity-10"
                        />
                      )}
                      {chart.sealedLine && (
                        <path
                          d={chart.sealedLine}
                          fill="none"
                          stroke="currentColor"
                          className="text-brand"
                          strokeWidth="2"
                        />
                      )}
                      {chart.draftLine && (
                        <path
                          d={chart.draftLine}
                          fill="none"
                          stroke="currentColor"
                          className="text-brand"
                          strokeWidth="2"
                          strokeDasharray="4 3"
                        />
                      )}
                      {chart.bestCircle && (
                        <circle
                          cx={chart.bestCircle.cx}
                          cy={chart.bestCircle.cy}
                          r="3"
                          fill="currentColor"
                          className="text-brand"
                        />
                      )}
                    </svg>
                    <div className="flex items-center justify-between text-[10px] text-ink-muted mt-1">
                      <span>{chart.fromLabel}</span>
                      <span className="mx-auto">dashed = draft days · dotted = previous 14</span>
                      <span>today</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  );
};
