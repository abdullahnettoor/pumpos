import React from 'react';
import { Button, Chip, Sparkline } from '../../../../pump-ds/index.js';
import { formatBusinessDate, formatDate } from '../../../../utils/format.js';
import {
  coverFallback,
  isYesterday,
  needsAttention,
  type DensityState,
  type FuelTank,
  type TankTone,
} from './fuelsModel.js';

const TONE_BAR: Record<TankTone, string> = {
  red: 'bg-danger-fg',
  amber: 'bg-warning-fg',
  ok: 'bg-success-fg',
  unknown: 'bg-ink-faint',
};

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
  timeZone: string | undefined;
  businessDate: string;
  canRecord: boolean;
  canDecant: boolean;
  canPlan: boolean;
  onRecord: () => void;
  onDecant: () => void;
  onPlan: () => void;
}

const timeText = (iso: string, timeZone: string | undefined) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone });

const PartError: React.FC<{ what: string; retry: () => void }> = ({ what, retry }) => (
  <div className="flex items-center gap-2 text-[12px] text-ink-muted" role="alert">
    <span>Couldn&apos;t load {what} ·</span>
    <Button variant="secondary" size="xs" onClick={retry}>
      Retry
    </Button>
  </div>
);

const Pulse: React.FC<{ h: number }> = ({ h }) => (
  <div
    className="animate-pulse rounded bg-surface-sunken"
    style={{ height: h }}
    aria-hidden="true"
  />
);

const DensityRow: React.FC<
  Pick<FuelBlockProps, 'density' | 'timeZone' | 'businessDate' | 'canRecord' | 'onRecord'>
> = ({ density, timeZone, businessDate, canRecord, onRecord }) => {
  if (density.status === 'loading') return <Pulse h={32} />;
  if (density.status === 'error') return <PartError what="density" retry={density.retry} />;
  const { state, trend } = density.value;
  if (state.kind === 'not-recorded') {
    return (
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="text-ink-muted">
          Density at 15 °C · <span className="font-medium text-ink">Not recorded</span>
          {state.last != null && <span> (last {state.last.toFixed(1)})</span>}
        </span>
        {canRecord && (
          <Button variant="ghost" size="xs" onClick={onRecord}>
            Record ›
          </Button>
        )}
      </div>
    );
  }
  const change = state.kind === 'recorded' || state.kind === 'jump' ? state.change : null;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-[12.5px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-muted">Density at 15 °C</span>
          <span className="font-semibold tabular-nums text-ink">{state.density.toFixed(1)}</span>
          {state.kind === 'jump' && (
            <Chip tone="danger" size="xs">
              Unexplained jump
            </Chip>
          )}
        </div>
        <div className="text-[11.5px] text-ink-muted">
          {state.tempC != null && `at ${state.tempC} °C · `}
          {timeText(state.at, timeZone)}
          {change && (
            <>
              {' · '}
              {change.delta > 0 ? '+' : ''}
              {change.delta.toFixed(1)} vs{' '}
              {isYesterday(change.from, businessDate)
                ? 'yesterday'
                : formatBusinessDate(change.from)}
            </>
          )}
          {state.kind === 'no-history' && ' · first reading'}
        </div>
      </div>
      {trend.length > 1 && (
        <Sparkline
          data={trend}
          tone={state.kind === 'jump' ? 'danger' : 'brand'}
          aria-label="Density, last 14 days"
        />
      )}
    </div>
  );
};

const TankRow: React.FC<{ tank: FuelTank }> = ({ tank }) => (
  <li className="flex items-center gap-2 text-[12px]" data-tone={tank.tone}>
    <span className="w-16 shrink-0 truncate text-ink-muted">{tank.name}</span>
    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
      <span
        className={`block h-full rounded-full ${TONE_BAR[tank.tone]}`}
        style={{ width: `${tank.fill}%` }}
      />
    </span>
    <span className="w-9 shrink-0 text-right font-medium tabular-nums text-ink">
      {tank.pct === null ? '—' : `${tank.pct}%`}
    </span>
    <span className="w-14 shrink-0 text-right tabular-nums text-ink-muted">
      {tank.capacityKl.toFixed(0)} KL
    </span>
    <span className="w-28 shrink-0 text-right text-ink-muted">
      {tank.cover ? `${tank.cover} cover` : coverFallback}
    </span>
  </li>
);

export const FuelBlock: React.FC<FuelBlockProps> = (p) => {
  const densityState = p.density.status === 'ready' ? p.density.value.state : null;
  const tanks = p.tanks.status === 'ready' ? p.tanks.value : [];
  const alert = needsAttention(tanks, densityState);
  const pending = tanks.filter((t) => t.waitingOnDecantation);

  return (
    <article
      className={`rounded-lg border p-3 ${alert ? 'border-danger-fg' : 'border-line'}`}
      data-testid={`fuel-${p.code}`}
      data-alert={alert ? 'true' : 'false'}
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-ink">{p.name}</h3>
          <span className="text-[11px] text-ink-muted">{p.code}</span>
        </div>
        <div className="text-right text-[12px]">
          <span className="font-semibold tabular-nums text-ink">
            {p.price > 0 ? `₹${p.price.toFixed(2)}/L` : 'No price'}
          </span>
          {p.effectiveFrom && (
            <span className="ml-1 text-ink-muted">
              since {formatDate(p.effectiveFrom, { compact: true })}
            </span>
          )}
        </div>
      </header>
      <div className="flex flex-col gap-2.5">
        <DensityRow {...p} />
        {p.tanks.status === 'loading' && <Pulse h={28} />}
        {p.tanks.status === 'error' && <PartError what="tanks" retry={p.tanks.retry} />}
        {p.tanks.status === 'ready' && (
          <ul className="flex flex-col gap-1.5">
            {p.tanks.value.map((t) => (
              <TankRow key={t.id} tank={t} />
            ))}
          </ul>
        )}
        {pending.length > 0 && (
          <div className="flex items-center justify-between gap-2 rounded bg-warning-soft px-2 py-1 text-[12px] text-warning-fg">
            <span>Decantation pending · {pending.map((t) => t.name).join(', ')}</span>
            {p.canDecant && (
              <Button variant="ghost" size="xs" onClick={p.onDecant}>
                Decant ›
              </Button>
            )}
          </div>
        )}
        {p.canPlan && (
          <div className="flex justify-end">
            <Button variant="ghost" size="xs" onClick={p.onPlan}>
              Plan purchase ›
            </Button>
          </div>
        )}
      </div>
    </article>
  );
};
