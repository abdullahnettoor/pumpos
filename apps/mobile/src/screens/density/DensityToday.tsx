import React from 'react';
import type { DensityTodaySummary, DensityTodayProductSummary } from '@pump/shared';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { formatTime } from './format.js';

type Band = { minKgM3?: number; maxKgM3?: number };

/** Today tab: one card per fuel product with today's value, spec band and recent readings. */
export const DensityToday: React.FC<{
  today: DensityTodaySummary;
  bands: Record<string, Band | undefined>;
  onRecord: (productId: string) => void;
}> = ({ today, bands, onRecord }) => (
  <>
    <p className="px-4 text-xs text-text-muted" aria-live="polite">
      {today.recordedCount}/{today.totalProducts} products recorded today
    </p>
    {today.products.map((product) => (
      <TodayProductCard
        key={product.productId}
        product={product}
        band={bands[product.productId]}
        onRecord={() => onRecord(product.productId)}
      />
    ))}
    {!today.products.length && (
      <p className="mx-3 rounded-xl border border-line p-4 text-sm text-text-muted">
        No active fuel products found.
      </p>
    )}
  </>
);

const TodayProductCard: React.FC<{
  product: DensityTodayProductSummary;
  band?: { minKgM3?: number; maxKgM3?: number };
  onRecord: () => void;
}> = ({ product, band, onRecord }) => {
  const current = product.latestToday;
  const latest = current ?? product.lastReadings[0];
  const lastReadings = product.lastReadings.length
    ? product.lastReadings
    : current
      ? [current]
      : [];
  const specText = band
    ? band.minKgM3 != null && band.maxKgM3 != null
      ? `Spec ${band.minKgM3}–${band.maxKgM3} kg/m³`
      : band.minKgM3 != null
        ? `Spec ≥ ${band.minKgM3} kg/m³`
        : `Spec ≤ ${band.maxKgM3} kg/m³`
    : null;
  return (
    <article
      aria-label={`${product.productName} (${product.productCode})`}
      className="mx-3 flex flex-col gap-2 rounded-xl border border-line bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-text-high">
            {product.productName}{' '}
            <span className="text-xs font-medium text-text-muted">({product.productCode})</span>
          </h2>
          <p className="text-xs text-text-muted">
            {current
              ? `Today · ${formatTime(current.recordedAt)}`
              : latest
                ? `Last reading · ${latest.businessDate}`
                : 'No readings yet'}
          </p>
        </div>
        <StatusBadge tone={current ? 'good' : 'warn'}>
          {current ? 'Recorded today' : 'Missing today'}
        </StatusBadge>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="num text-[25px] font-bold leading-none text-text-high">
          {latest ? latest.density15.toFixed(2) : '—'}
          <span className="ml-1 text-xs font-medium text-text-muted">kg/m³</span>
        </p>
        {specText && <span className="text-right text-xs text-text-muted">{specText}</span>}
      </div>
      <div className="border-t border-line pt-2">
        <p className="mb-1 text-xs font-semibold text-text-muted">Last readings</p>
        {lastReadings.length ? (
          lastReadings.slice(0, 3).map((reading) => (
            <p
              key={reading.id}
              className="flex justify-between gap-2 py-0.5 text-xs text-text-muted"
            >
              <span className="truncate">
                {reading.businessDate} · {reading.kind}
                {reading.tankName
                  ? ` · ${reading.tankName}`
                  : reading.nozzleName
                    ? ` · ${reading.nozzleName}`
                    : ''}
              </span>
              <span className="num flex-shrink-0">{reading.density15.toFixed(2)}</span>
            </p>
          ))
        ) : (
          <p className="text-xs text-text-faint">No previous readings</p>
        )}
      </div>
      <button
        type="button"
        onClick={onRecord}
        className="hit-44 rounded-lg border border-line px-3 text-left text-xs font-semibold text-accent"
      >
        {current ? 'Add reading' : "Record today's density"}
      </button>
    </article>
  );
};
