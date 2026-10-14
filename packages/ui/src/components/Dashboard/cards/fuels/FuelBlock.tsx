import React from 'react';
import {
  Button,
  DensityReading,
  Icon,
  TankGauge,
  type DensityState,
} from '../../../../pump-ds/index.js';
import {
  formatClockInZone,
  formatDayMonth,
  formatMoney,
  formatQty,
} from '../../../../utils/format.js';
import {
  coverFallback,
  needsAttention,
  shouldPlanPurchase,
  type PendingDecant,
  type FuelTank,
} from './fuelsModel.js';

/** Part state: each of density / tanks loads (and fails) on its own. */
export type Part<T> =
  { status: 'loading' } | { status: 'error'; retry: () => void } | { status: 'ready'; value: T };

export interface FuelBlockProps {
  name: string;
  code: string;
  price: number;
  effectiveFrom: string | null;
  density: Part<{ state: DensityState; trend: number[] }>;
  tanks: Part<FuelTank[]>;
  pendingDecant: PendingDecant | null;
  timeZone: string | undefined;
  businessDate: string;
  /** Header swatch class (`fuelSwatch`). */
  swatch: string;
  canRecord: boolean;
  canDecant: boolean;
  canPlan: boolean;
  onRecord: () => void;
  onDecant: () => void;
  onPlan: () => void;
}

const PartError: React.FC<{ what: string; retry: () => void }> = ({ what, retry }) => (
  <div className="flex items-center gap-2 text-[12px] text-ink-muted" role="alert">
    <span>Couldn&apos;t load {what} ·</span>
    <Button variant="secondary" size="xs" onClick={retry}>
      Retry
    </Button>
  </div>
);

const Pulse: React.FC<{ h: number }> = ({ h }) => (
  <div className="animate-pulse rounded bg-surface-alt" style={{ height: h }} aria-hidden="true" />
);

const ROW = 'border-t [--tw-border-style:dashed] border-border-soft px-3 py-2';

const DensityRow: React.FC<
  Pick<FuelBlockProps, 'density' | 'timeZone' | 'businessDate' | 'canRecord' | 'onRecord'>
> = ({ density, timeZone, businessDate, canRecord, onRecord }) => {
  if (density.status === 'loading')
    return (
      <div className={ROW}>
        <Pulse h={32} />
      </div>
    );
  if (density.status === 'error')
    return (
      <div className={ROW}>
        <PartError what="density" retry={density.retry} />
      </div>
    );
  const { state, trend } = density.value;
  return (
    <div className={ROW}>
      <DensityReading
        state={state}
        trend={trend}
        timeZone={timeZone}
        businessDate={businessDate}
        action={
          canRecord && (
            <Button variant="ghost" size="xs" onClick={onRecord}>
              Record ›
            </Button>
          )
        }
      />
    </div>
  );
};

/** Pending decantation shows in the block's own banner, so the gauge leaves it out. */
const TankRow: React.FC<{ tank: FuelTank }> = ({ tank }) => (
  <li className={ROW} data-tone={tank.tone}>
    <TankGauge name={tank.name} level={tank} coverFallback={coverFallback} showStatus={false} />
  </li>
);

export const FuelBlock: React.FC<FuelBlockProps> = (p) => {
  const densityState = p.density.status === 'ready' ? p.density.value.state : null;
  const tanks = p.tanks.status === 'ready' ? p.tanks.value : [];
  const alert = needsAttention(tanks, densityState);
  const pending = tanks.filter((t) => t.waitingOnDecantation);
  const showPlan = p.canPlan && p.tanks.status === 'ready' && shouldPlanPurchase(tanks);
  const pd = p.pendingDecant;

  return (
    <article
      className={`overflow-hidden rounded-lg border bg-surface ${
        alert ? 'border-danger-fg/40' : 'border-border-soft'
      }`}
      data-testid={`fuel-${p.code}`}
      data-alert={alert ? 'true' : 'false'}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`size-2 shrink-0 rounded-[3px] ${p.swatch}`} aria-hidden="true" />
          <h3 className="text-[14px] font-semibold text-ink">{p.name}</h3>
          <span className="text-[11px] text-ink-muted">{p.code}</span>
        </div>
        <div className="text-right">
          <div className="font-mono text-[15px] font-semibold tabular-nums text-ink">
            {p.price > 0 ? (
              <>
                {formatMoney(p.price)}
                <span className="text-[11px] font-normal text-ink-muted">/L</span>
              </>
            ) : (
              'No price'
            )}
          </div>
          {p.effectiveFrom && (
            <div className="text-[11px] text-ink-muted">
              since {formatDayMonth(p.effectiveFrom, p.timeZone)}
            </div>
          )}
        </div>
      </header>
      <DensityRow {...p} />
      {p.tanks.status === 'loading' && (
        <div className={ROW}>
          <Pulse h={30} />
        </div>
      )}
      {p.tanks.status === 'error' && (
        <div className={ROW}>
          <PartError what="tanks" retry={p.tanks.retry} />
        </div>
      )}
      {p.tanks.status === 'ready' && (
        <ul>
          {p.tanks.value.map((t) => (
            <TankRow key={t.id} tank={t} />
          ))}
        </ul>
      )}
      {showPlan && (
        <div className={`${ROW} flex justify-end`}>
          <Button variant="ghost" size="xs" onClick={p.onPlan}>
            Plan purchase ›
          </Button>
        </div>
      )}
      {pending.length > 0 && p.canDecant && (
        <div className="flex items-center justify-between gap-2 border-t border-warning-fg/30 bg-warning-bg px-3 py-2 text-[12px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Icon name="truck" size="xs" className="text-warning-fg" />
            <span>
              {pd?.qtyL != null ? (
                <b className="text-ink">
                  {formatQty(pd.qtyL / 1000, 1)} KL tanker waiting to decant
                </b>
              ) : (
                <b className="text-ink">
                  Tanker waiting to decant · {pending.map((t) => t.name).join(', ')}
                </b>
              )}
              {pd?.since && ` · since ${formatClockInZone(pd.since, p.timeZone)}`}
            </span>
          </span>
          <Button variant="ghost" size="xs" onClick={p.onDecant}>
            Decant ›
          </Button>
        </div>
      )}
    </article>
  );
};
