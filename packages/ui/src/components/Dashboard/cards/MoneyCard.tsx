import React, { useMemo } from 'react';
import {
  DASHBOARD_TREND_DAYS,
  canSeeDashboardCard,
  comparisonView,
  deriveComparison,
  deriveSales,
  num,
  readSnapshot,
  shiftBusinessDate,
} from '@pump/shared';
import { formatBusinessDate, formatCompactMoney, formatMoney } from '../../../utils/format.js';
import { buildTrendChart, deriveCashInHand } from './money/moneyModel.js';
import { Button } from '../../../pump-ds/index.js';
import { useDailyCashBook, useDailyDssrPreview, useInsightsSales } from '../../../query/hooks.js';
import { useCardEnabled, useDashboard } from '../frame/DashboardContext.js';
import { DashboardCard } from '../frame/DashboardCard.js';

/**
 * Money hero card: "Sales so far" + 14-day trend (#506).
 * Reuses the mobile Home headline rule/source:
 * - Fuel from closed Shifts only, plus live Product Sales
 * - When no shift closed yet: ₹0 with 'Fuel counts at shift close'
 * - Margin (Owner only), Credit, Cash in Hand
 * - 14-day trend: sealed days solid, draft days dashed, previous dotted, best day marked
 */
export const MoneyCard: React.FC = () => {
  const { station, role, businessDate, entryDate, onNavigate } = useDashboard();
  const enabled = useCardEnabled('money');
  const canTrend = canSeeDashboardCard('trend', role);
  const isOwner = canSeeDashboardCard('liveMargin', role);

  const todayPreviewQ = useDailyDssrPreview(station.id, businessDate, { enabled });
  const prevDate = shiftBusinessDate(businessDate, -1);
  const insightsQ = useInsightsSales(station.id, DASHBOARD_TREND_DAYS, {
    enabled: enabled && canTrend,
  });
  const cashBookQ = useDailyCashBook(station.id, entryDate, { enabled });

  const todaySnap = useMemo(() => readSnapshot(todayPreviewQ.data), [todayPreviewQ.data]);
  const sales = useMemo(() => deriveSales(todaySnap), [todaySnap]);
  const hasClosedShift = sales.closedShifts.length > 0;
  const prevPreviewQ = useDailyDssrPreview(station.id, prevDate, {
    enabled: enabled && hasClosedShift,
  });

  const comparison = useMemo(() => {
    if (!hasClosedShift) return null;
    const prevSnap = readSnapshot(prevPreviewQ.data);
    return deriveComparison(sales, prevSnap, prevDate);
  }, [sales, prevPreviewQ.data, prevDate, hasClosedShift]);

  const compView = comparison ? comparisonView(comparison) : null;

  const margin = num(todaySnap.pnl?.grossMargin);
  const credit = num(todaySnap.credit?.total ?? todaySnap.settlements?.credit);
  const cashInHand = deriveCashInHand(cashBookQ.data);

  const trendData = insightsQ.data;
  const showTrend = canTrend;
  const hasEnoughHistory = !!trendData && trendData.closedDays >= 3;

  const chart = useMemo(
    () => (trendData && hasEnoughHistory ? buildTrendChart(trendData) : null),
    [trendData, hasEnoughHistory],
  );
  const fromLabel = trendData?.range?.from ? formatBusinessDate(trendData.range.from) : '';

  return (
    <DashboardCard
      card="money"
      title="Sales so far"
      query={todayPreviewQ}
      placeholderHeight={260}
      variant="plain"
    >
      <div
        className="flex flex-col gap-3 rounded-lg border border-brand/25 bg-linear-to-r from-success-bg to-surface p-3.5"
        data-testid="money-hero"
      >
        {!hasClosedShift ? (
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Sales so far today
            </div>
            <div
              className="text-2xl font-medium tracking-tight text-ink font-mono mt-1"
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
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              Sales so far today
            </div>
            <div
              className="text-2xl font-medium tracking-tight text-ink font-mono mt-1"
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
                  compView.tone === 'bad' ? 'text-danger-fg' : 'text-success-fg'
                }`}
              >
                {compView.arrow ? `${compView.arrow} ` : ''}
                {compView.text}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3.5 pt-2.5 border-t border-brand/20">
          {isOwner && (
            <div data-testid="margin-tile">
              <div className="text-xs text-ink-muted">Margin</div>
              <div className="font-mono text-sm font-medium text-success-fg">
                {formatCompactMoney(margin)}
              </div>
            </div>
          )}
          <div data-testid="credit-tile">
            <div className="text-xs text-ink-muted">Credit</div>
            <div className="font-mono text-sm font-medium text-warning-fg">
              {formatCompactMoney(credit)}
            </div>
          </div>
          <div data-testid="cash-in-hand-tile">
            <div className="text-xs text-ink-muted">Cash in hand</div>
            <div className="font-mono text-sm font-medium text-ink">
              {formatCompactMoney(cashInHand)}
            </div>
          </div>
        </div>

        {showTrend && (
          <div className="pt-2.5 border-t border-brand/20">
            {insightsQ.isError ? (
              <div className="flex items-center gap-3 text-xs text-ink-muted" role="alert">
                <span>Couldn&apos;t load the 14-day trend ·</span>
                <Button variant="secondary" size="xs" onClick={() => void insightsQ.refetch()}>
                  Retry
                </Button>
              </div>
            ) : insightsQ.isPending || !trendData ? (
              <div
                className="h-[88px] animate-pulse rounded bg-surface-alt"
                data-testid="trend-placeholder"
                aria-busy="true"
              />
            ) : !hasEnoughHistory ? (
              <div className="text-xs text-ink-muted">
                The 14-day trend appears once 3 business days are closed.
              </div>
            ) : (
              <div>
                <div className="flex items-center text-xs">
                  <span className="text-ink-muted">Last 14 days</span>
                  <span className="ml-2 text-ink">
                    avg{' '}
                    <b className="font-mono font-medium">{formatCompactMoney(trendData.average)}</b>
                  </span>
                  {trendData.changePct !== null && (
                    <span
                      className={`ml-2 font-mono font-medium ${
                        trendData.changePct >= 0 ? 'text-success-fg' : 'text-danger-fg'
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

                {chart && trendData && (
                  <>
                    {/* The SVG stretches to the card width (preserveAspectRatio="none"),
                        so strokes use non-scaling-stroke and the best-day dot is an
                        HTML overlay: an SVG <circle> would be squashed into an ellipse. */}
                    <div className="relative mt-2">
                      <svg
                        role="img"
                        aria-label="Sales trend, last 14 days"
                        viewBox={`0 0 ${chart.W} ${chart.H}`}
                        width="100%"
                        height={chart.H}
                        preserveAspectRatio="none"
                        className="block overflow-visible"
                      >
                        {chart.prevLine && (
                          <path
                            d={chart.prevLine}
                            fill="none"
                            stroke="currentColor"
                            className="text-ink-muted opacity-40"
                            strokeWidth="1.2"
                            vectorEffect="non-scaling-stroke"
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
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        {chart.draftLine && (
                          <path
                            d={chart.draftLine}
                            fill="none"
                            stroke="currentColor"
                            className="text-brand"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                            strokeDasharray="4 3"
                          />
                        )}
                      </svg>
                      {chart.bestCircle && (
                        <span
                          data-testid="trend-best-day"
                          aria-hidden="true"
                          className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand"
                          style={{
                            left: `${(Number(chart.bestCircle.cx) / chart.W) * 100}%`,
                            top: `${Number(chart.bestCircle.cy)}px`,
                          }}
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-ink-muted mt-1">
                      <span>{fromLabel}</span>
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
