import React, { useState } from 'react';
import { INSIGHTS_RANGE_DAYS, type InsightsRangeDays, type Station } from '@pump/shared';
import { useInsightsSales } from '@pump/ui';
import { SectionLabel, SegmentedControl } from '../ui/index.js';
import { ProductMix } from './insights/ProductMix.js';
import { SalesTrend } from './insights/SalesTrend.js';
import { ShiftPerformance } from './insights/ShiftPerformance.js';

const OPTIONS = INSIGHTS_RANGE_DAYS.map((d) => ({ value: String(d), label: `${d} days` }));

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mx-3 rounded-[14px] border border-line bg-card px-3 py-5 text-center text-xs text-text-muted">
    {children}
  </p>
);

/**
 * Insights: trends only. Every figure comes from the sealed-data read
 * (`useInsightsSales`); nothing is computed here. Alerts, tanks, Team and
 * Organization live on Home, the bell and the Account sheet.
 */
export const InsightsScreen: React.FC<{ station: Station }> = ({ station }) => {
  const [days, setDays] = useState<InsightsRangeDays>(7);
  const q = useInsightsSales(station.id, days);
  const data = q.data;
  const noHistory = !!data && (!data.range || data.closedDays === 0);

  return (
    <div className="pb-2">
      <SegmentedControl
        label="Range"
        options={OPTIONS}
        value={String(days)}
        onChange={(v) => setDays(Number(v) as InsightsRangeDays)}
      />

      {q.isError ? (
        <p className="mx-3 mt-3 rounded-[14px] border border-bad-line bg-bad-soft px-3 py-2.5 text-xs text-bad-fg">
          Could not load insights.{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => void q.refetch()}
          >
            Retry
          </button>
        </p>
      ) : !data ? (
        <p className="px-4 py-10 text-center text-sm text-text-muted">Loading insights…</p>
      ) : noHistory ? (
        <div className="mt-3">
          <Empty>No closed Business Days yet. Insights appear once a day is closed.</Empty>
        </div>
      ) : (
        <>
          <div className="mt-2.5">
            <SalesTrend data={data} days={days} />
          </div>

          <SectionLabel right="by litres">Product mix</SectionLabel>
          <ProductMix data={data} days={days} />

          <SectionLabel right="avg per shift">Shift performance</SectionLabel>
          {data.shiftTemplates.length > 0 ? (
            <ShiftPerformance data={data} />
          ) : (
            <Empty>No closed Shifts in this range.</Empty>
          )}
        </>
      )}

      {/* Part 2 (#402) adds its blocks here: variance by attendant, stock loss, credit health. */}
    </div>
  );
};
