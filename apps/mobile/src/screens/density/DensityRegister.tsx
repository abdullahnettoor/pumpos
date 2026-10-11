import React from 'react';
import { isUnexplainedDensityJump, type DensityReadingWithContext } from '@pump/shared';
import { StatusBadge } from '../../ui/StatusBadge.js';
import { formatTime } from './format.js';

type Product = { id: string; name: string; code: string };

/** Register tab: product filter plus every reading, newest first. */
export const DensityRegister: React.FC<{
  products: readonly Product[];
  productFilter: string;
  onFilter: (productId: string) => void;
  readings: readonly DensityReadingWithContext[];
  isLoading: boolean;
  isError: boolean;
  tolerance: number;
}> = ({ products, productFilter, onFilter, readings, isLoading, isError, tolerance }) => (
  <>
    <label className="px-3">
      <span className="sr-only">Filter by product</span>
      <select
        aria-label="Filter by product"
        value={productFilter}
        onChange={(event) => onFilter(event.target.value)}
        className="h-10 w-full rounded-xl border border-line-strong bg-card px-3 text-sm text-text-high"
      >
        <option value="">All products</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name} ({product.code})
          </option>
        ))}
      </select>
    </label>
    {isLoading && (
      <p className="px-4 py-8 text-center text-sm text-text-muted">Loading register…</p>
    )}
    {isError && (
      <p
        role="alert"
        className="mx-3 rounded-xl border border-bad-line bg-bad-soft p-3 text-sm text-bad-fg"
      >
        Could not load the density register.
      </p>
    )}
    {!isLoading && readings.length === 0 && (
      <p className="mx-3 rounded-xl border border-line p-4 text-sm text-text-muted">
        No density readings match this product.
      </p>
    )}
    <div className="flex flex-col gap-2 px-3">
      {readings.map((reading) => (
        <RegisterReading key={reading.id} reading={reading} tolerance={tolerance} />
      ))}
    </div>
  </>
);

const RegisterReading: React.FC<{ reading: DensityReadingWithContext; tolerance: number }> = ({
  reading,
  tolerance,
}) => {
  const flags = Array.isArray(reading.flags) ? reading.flags.map(String) : [];
  const jump = isUnexplainedDensityJump({
    delta: reading.delta,
    kind: reading.kind,
    flags,
    tolerance,
  });
  return (
    <article
      aria-label={`${reading.productName ?? reading.productId} ${reading.businessDate}`}
      className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-text-high">
            {reading.productName ?? reading.productId}{' '}
            <span className="text-xs font-medium text-text-muted">· {reading.productCode}</span>
          </p>
          <p className="text-xs text-text-muted">
            {reading.businessDate} · {formatTime(reading.recordedAt)} · {reading.kind}
          </p>
        </div>
        {jump && <StatusBadge tone="warn">Jump flagged</StatusBadge>}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-text-muted">
        <span>
          {reading.tankName ?? reading.nozzleName ?? reading.sampledFrom ?? 'Source not recorded'}
        </span>
        <span className="num">
          {reading.observedDensity == null
            ? 'Direct 15 °C'
            : `${reading.observedDensity.toFixed(1)} kg/m³ · ${reading.observedTempC?.toFixed(1) ?? '—'} °C`}
        </span>
        <span className="num font-bold text-text-high">{reading.density15.toFixed(2)} kg/m³</span>
      </div>
      {flags.length > 0 && <p className="text-xs text-warn-fg">{flags.join(', ')}</p>}
      <p className="text-xs text-text-faint">
        {reading.recordedByName ?? 'Recorded by station user'}
      </p>
    </article>
  );
};
