import React, { useMemo, useState } from 'react';
import { Chip, EmptyState, Panel, formatDensity, formatTempC } from '../../../pump-ds/index.js';
import { formatClockInZone } from '../../../utils/format.js';
import { DeltaChip } from './DeltaChip.js';
import type { DensityReadingWithContext } from '@pump/shared';

export interface RegisterViewProps {
  readings: DensityReadingWithContext[];
  products: Array<{ id: string; name: string; code: string }>;
  /** The station's jump tolerance (`resolveDecantationSettings`). */
  tolerance: number;
  /** The station's IANA timezone; times never use the device clock. */
  timeZone: string | undefined;
}

const TH =
  'border-b border-border-soft bg-surface-alt px-3 py-2 text-left text-[12px] font-semibold text-ink-muted';
const TD = 'border-b border-border-soft px-3 py-2 text-[13px] text-ink';
const NUM = `${TD} text-right font-mono tabular-nums`;

export const RegisterView: React.FC<RegisterViewProps> = ({
  readings,
  products,
  tolerance,
  timeZone,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedKind, setSelectedKind] = useState<string>('');

  const filtered = useMemo(() => {
    return readings.filter((r) => {
      if (selectedProduct && r.productId !== selectedProduct) return false;
      if (selectedKind && r.kind !== selectedKind) return false;
      return true;
    });
  }, [readings, selectedProduct, selectedKind]);

  return (
    <Panel
      flush
      title="Density Register Log"
      action={
        <div className="flex items-center gap-2">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="input h-[30px] min-w-[130px] text-[12px]"
            aria-label="Filter by product"
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
          <select
            value={selectedKind}
            onChange={(e) => setSelectedKind(e.target.value)}
            className="input h-[30px] min-w-[120px] text-[12px]"
            aria-label="Filter by kind"
          >
            <option value="">All routines</option>
            <option value="MORNING">Morning (Daily)</option>
            <option value="ADHOC">Ad-hoc check</option>
            <option value="DECANTATION">Decantation</option>
          </select>
        </div>
      }
    >
      {filtered.length === 0 ? (
        <div className="p-8">
          <EmptyState
            title="No density readings"
            description="No density readings match the selected filters."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Time</th>
                <th className={TH}>Product</th>
                <th className={TH}>Routine</th>
                <th className={TH}>Sampled from</th>
                <th className={`${TH} text-right`}>Hydrometer</th>
                <th className={`${TH} text-right`}>Temp</th>
                <th className={`${TH} text-right`}>At 15 °C</th>
                <th className={`${TH} text-right`}>Δ previous</th>
                <th className={TH}>Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, index) => {
                const showDate = r.businessDate !== filtered[index - 1]?.businessDate;
                const sampledLabel =
                  r.tankName || r.nozzleName || (r.sampledFrom ? r.sampledFrom : '—');
                const kindTone =
                  r.kind === 'DECANTATION' ? 'info' : r.kind === 'MORNING' ? 'brand' : 'neutral';

                return (
                  <tr key={r.id} className={showDate ? 'border-t-2 border-border-soft' : undefined}>
                    <td className={`${TD} ${showDate ? 'font-semibold' : ''}`}>
                      {showDate ? r.businessDate : ''}
                    </td>
                    <td className={`${TD} text-ink-muted`}>
                      {formatClockInZone(r.recordedAt, timeZone)}
                    </td>
                    <td className={TD}>
                      <strong>{r.productName || r.productId}</strong>{' '}
                      <span className="text-ink-muted">· {r.productCode}</span>
                    </td>
                    <td className={TD}>
                      <Chip size="sm" tone={kindTone}>
                        {r.kind}
                      </Chip>
                    </td>
                    <td className={`${TD} text-ink-muted`}>{sampledLabel}</td>
                    <td className={NUM}>
                      {r.observedDensity != null ? formatDensity(r.observedDensity) : '—'}
                    </td>
                    <td className={NUM}>
                      {r.observedTempC != null ? formatTempC(r.observedTempC) : '—'}
                    </td>
                    <td className={`${NUM} font-semibold`}>{formatDensity(r.density15)}</td>
                    <td className={`${TD} text-right`}>
                      <DeltaChip
                        delta={r.delta}
                        kind={r.kind}
                        flags={r.flags}
                        tolerance={tolerance}
                      />
                    </td>
                    <td className={`${TD} text-[12px] text-ink-muted`}>
                      {r.recordedByName || r.recordedBy || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};
