import React from 'react';
import type { Station } from '@pump/shared';
import { SalesByProduct } from '../components/SalesByProduct.js';
import { compactRupees, signedRupees } from '../lib/home/format.js';
import { comparisonView, type Comparison } from '../lib/home/sales.js';
import { useNav } from '../shell/nav.js';
import { SectionLabel, StatTile } from '../ui/index.js';
import { HandoverCard } from './home/HandoverCard.js';
import { HomeAttention } from './home/HomeAttention.js';
import { LiveShiftStrip } from './home/LiveShiftStrip.js';
import { MoneyPosition } from './home/MoneyPosition.js';
import { SalesHeadline } from './home/SalesHeadline.js';
import { TankGauges } from './home/TankGauges.js';
import { useHomeData } from './home/useHomeData.js';

interface Props {
  station: Station;
}

const ComparisonNote: React.FC<{ c: Comparison }> = ({ c }) => {
  const v = comparisonView(c);
  return (
    <span className={v.tone === 'bad' ? 'text-bad-fg' : ''}>
      {v.arrow && (
        <>
          <span aria-hidden="true">{v.arrow}</span>
          <span className="sr-only">{v.srLabel}</span>{' '}
        </>
      )}
      {v.text}
    </span>
  );
};

/**
 * Home, the Control Room's first tab: the pinned handover card (only for a user
 * assigned to a Dispenser Unit), live Shift, an honest sales headline
 * (fuel from closed Shifts only, Product Sales live), the day's tiles, the top
 * alerts, Sales by product, tank gauges and the money position.
 */
export const HomeScreen: React.FC<Props> = ({ station }) => {
  const nav = useNav();
  const m = useHomeData(station);
  const t = m.tiles;
  const canOpen = (tab: 'reports' | 'money') => nav.tabs.includes(tab);

  return (
    <div className="pb-2">
      <HandoverCard />
      <LiveShiftStrip shift={m.live} loading={m.shiftLoading} />

      <SectionLabel right={m.comparison ? <ComparisonNote c={m.comparison} /> : undefined}>
        Sales · {m.dateLabel}
      </SectionLabel>
      {m.salesError ? (
        <p className="mx-3 rounded-[14px] border border-bad-line bg-bad-soft px-3 py-2.5 text-xs text-bad-fg">
          Could not load today&apos;s sales.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-3">
          <SalesHeadline
            sales={m.sales}
            split={m.split}
            openShift={m.openShiftInDay ? m.live : null}
            trend={m.trend}
          />
          <StatTile
            label="Cash variance"
            value={t.variance.value === null ? '—' : signedRupees(t.variance.value)}
            sub={t.variance.detail}
            note={t.variance.secondary}
            tone={t.variance.tone}
          />
          <StatTile
            label="Gross margin"
            value={t.margin.value === null ? '—' : compactRupees(t.margin.value)}
            sub={t.margin.detail}
            tone={t.margin.tone}
          />
          <StatTile
            label="Credit sales"
            value={compactRupees(t.credit.value ?? 0)}
            sub={t.credit.detail}
            tone={t.credit.tone}
          />
          <StatTile
            label="Purchases"
            value={compactRupees(t.purchases.value ?? 0)}
            sub={t.purchases.detail}
            tone={t.purchases.tone}
          />
        </div>
      )}

      <HomeAttention alerts={m.alerts} />

      <SectionLabel
        right={
          canOpen('reports') ? (
            <button type="button" onClick={() => nav.select('reports')}>
              Daily report ›
            </button>
          ) : undefined
        }
      >
        Sales by product
      </SectionLabel>
      <SalesByProduct
        fuel={m.sales.fuel}
        products={m.sales.products}
        fuelTotal={m.sales.fuelValue}
        productsTotal={m.sales.productsValue}
        fuelNote={{
          text: m.sales.closedShifts.length
            ? `${m.sales.closedShifts.map((s) => s.label).join(' + ')} · closed`
            : 'No closed Shift yet',
        }}
        productsNote={{ text: 'Live', live: true }}
      />

      {m.tanks.length > 0 && (
        <>
          <SectionLabel>Tanks</SectionLabel>
          <TankGauges tanks={m.tanks} />
        </>
      )}

      <SectionLabel
        right={
          canOpen('money') ? (
            <button type="button" onClick={() => nav.select('money')}>
              Money ›
            </button>
          ) : undefined
        }
      >
        Money position
      </SectionLabel>
      <MoneyPosition money={m.money} />
    </div>
  );
};
