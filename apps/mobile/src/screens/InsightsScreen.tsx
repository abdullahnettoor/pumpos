import React, { useState } from 'react';
import { INSIGHTS_RANGE_DAYS, type InsightsRangeDays, type Station } from '@pump/shared';
import { useInsightsSales } from '@pump/ui';
import { SectionLabel, SegmentedControl } from '../ui/index.js';
import { AttendantVariance } from './insights/AttendantVariance.js';
import { CreditHealth } from './insights/CreditHealth.js';
import { ProductMix } from './insights/ProductMix.js';
import { SalesTrend } from './insights/SalesTrend.js';
import { ShiftPerformance } from './insights/ShiftPerformance.js';
import { StateCard } from './insights/StateCard.js';
import { StockLoss } from './insights/StockLoss.js';

const OPTIONS = INSIGHTS_RANGE_DAYS.map((d) => ({ value: String(d), label: `${d} days` }));

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
        <div className="mt-3">
          <StateCard kind="error" onRetry={() => void q.refetch()} className="px-3 py-2.5">
            Could not load insights.
          </StateCard>
        </div>
      ) : !data ? (
        <div className="mt-3">
          <StateCard kind="loading" className="px-4 py-10 text-sm">
            Loading insights…
          </StateCard>
        </div>
      ) : noHistory ? (
        <div className="mt-3">
          <StateCard kind="empty" className="px-3 py-5">
            No closed Business Days yet. Insights appear once a day is closed.
          </StateCard>
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
            <StateCard kind="empty" className="px-3 py-5">
              No closed Shifts in this range.
            </StateCard>
          )}
        </>
      )}

      {/*
        Part 2 (#402): each block is its own read under the same range, with its own
        states, mounted independently of the sales read so one failing block (or the
        sales block failing) never blanks the others. They are left out only when the
        sales read has already shown the Station has no closed Business Day at all.
      */}
      {!noHistory && (
        <>
          <AttendantVariance stationId={station.id} days={days} />
          <StockLoss stationId={station.id} days={days} />
          <CreditHealth stationId={station.id} days={days} />
        </>
      )}
    </div>
  );
};
