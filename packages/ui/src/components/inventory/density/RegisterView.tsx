import React, { useMemo } from 'react';
import { Chip, InteractiveTable, Select, type TableColumn } from '../../../pump-ds/index.js';
import {
  formatClockInZone,
  formatDayMonth,
  formatDensity,
  formatTemperature,
} from '../../../utils/format.js';
import { DeltaChip } from './DeltaChip.js';
import { DENSITY_KIND_LABEL, DENSITY_KINDS, type DensityRegisterFilter } from './densityKind.js';
import type { DensityReadingWithContext } from '@pump/shared';

export interface RegisterFiltersProps {
  products: Array<{ id: string; name: string; code: string }>;
  value: DensityRegisterFilter;
  onChange: (value: DensityRegisterFilter) => void;
}

/** The Register's row filters, for the section header's control bar. Apply instantly. */
export const RegisterFilters: React.FC<RegisterFiltersProps> = ({ products, value, onChange }) => (
  <>
    <Select
      inputSize="sm"
      className="min-w-[150px]"
      value={value.productId}
      onChange={(e) => onChange({ ...value, productId: e.target.value })}
      aria-label="Filter by product"
    >
      <option value="">All products</option>
      {products.map((product) => (
        <option key={product.id} value={product.id}>
          {product.name} ({product.code})
        </option>
      ))}
    </Select>
    <Select
      inputSize="sm"
      className="min-w-[130px]"
      value={value.kind}
      onChange={(e) =>
        onChange({ ...value, kind: e.target.value as DensityRegisterFilter['kind'] })
      }
      aria-label="Filter by kind"
    >
      <option value="">All routines</option>
      {DENSITY_KINDS.map((kind) => (
        <option key={kind} value={kind}>
          {DENSITY_KIND_LABEL[kind]}
        </option>
      ))}
    </Select>
  </>
);

export interface RegisterViewProps {
  /** The rows to show, already filtered and ordered (`filterDensityReadings`). */
  readings: DensityReadingWithContext[];
  /** The station's jump tolerance (`resolveDecantationSettings`). */
  tolerance: number;
  /** The station's IANA timezone; times never use the device clock. */
  timeZone: string;
}

const sampledLabel = (r: DensityReadingWithContext): string =>
  r.tankName || r.nozzleName || r.sampledFrom || '';

/** The density register: every reading, newest first. Densities never total. */
export const RegisterView: React.FC<RegisterViewProps> = ({ readings, tolerance, timeZone }) => {
  const columns = useMemo<TableColumn<DensityReadingWithContext>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        kind: 'date',
        value: (r) => r.businessDate,
        cell: (r) => formatDayMonth(r.businessDate),
      },
      {
        id: 'time',
        header: 'Time',
        kind: 'text',
        value: (r) => r.recordedAt,
        cell: (r) => (
          <span className="text-ink-muted">{formatClockInZone(r.recordedAt, timeZone)}</span>
        ),
      },
      {
        id: 'product',
        header: 'Product',
        kind: 'text',
        value: (r) => r.productName || r.productId,
        cell: (r) => (
          <>
            <span className="font-semibold">{r.productName || r.productId}</span>{' '}
            <span className="text-ink-muted">· {r.productCode}</span>
          </>
        ),
      },
      {
        id: 'routine',
        header: 'Routine',
        kind: 'text',
        value: (r) => DENSITY_KIND_LABEL[r.kind],
        cell: (r) => (
          <Chip size="sm" tone="neutral">
            {DENSITY_KIND_LABEL[r.kind]}
          </Chip>
        ),
      },
      {
        id: 'sampled',
        header: 'Sampled from',
        kind: 'text',
        value: sampledLabel,
        cell: (r) => <span className="text-ink-muted">{sampledLabel(r) || '—'}</span>,
      },
      {
        id: 'observed',
        header: 'Hydrometer',
        kind: 'qty',
        total: false,
        value: (r) => r.observedDensity,
        cell: (r) => formatDensity(r.observedDensity),
      },
      {
        id: 'temp',
        header: 'Temp',
        kind: 'qty',
        total: false,
        value: (r) => r.observedTempC,
        cell: (r) => formatTemperature(r.observedTempC),
      },
      {
        id: 'density15',
        header: 'At 15 °C',
        kind: 'qty',
        total: false,
        emphasis: true,
        value: (r) => r.density15,
        cell: (r) => formatDensity(r.density15),
      },
      {
        id: 'delta',
        header: 'Δ previous',
        kind: 'qty',
        total: false,
        value: (r) => r.delta,
        // The chip carries a word (`Unexplained jump`), so it reads in the sans face.
        cell: (r) => (
          <span className="font-sans">
            <DeltaChip delta={r.delta} kind={r.kind} flags={r.flags} tolerance={tolerance} />
          </span>
        ),
      },
      {
        id: 'recordedBy',
        header: 'Recorded by',
        kind: 'text',
        value: (r) => r.recordedByName || r.recordedBy,
        cell: (r) => (
          <span className="text-[12px] text-ink-muted">
            {r.recordedByName || r.recordedBy || '—'}
          </span>
        ),
      },
    ],
    [timeZone, tolerance],
  );

  return (
    <InteractiveTable
      bare
      columns={columns}
      rows={readings}
      rowKey={(r) => r.id}
      title="density readings"
    />
  );
};
