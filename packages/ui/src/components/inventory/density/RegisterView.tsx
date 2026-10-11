import React, { useMemo, useState } from 'react';
import { Chip, EmptyState, Panel } from '../../../pump-ds/index.js';
import { DeltaChip } from './DeltaChip.js';
import type { DensityReadingWithContext } from '@pump/shared';

export interface RegisterViewProps {
  readings: DensityReadingWithContext[];
  products: Array<{ id: string; name: string; code: string }>;
  tolerance?: number;
}

export const RegisterView: React.FC<RegisterViewProps> = ({
  readings,
  products,
  tolerance = 3,
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

  let lastDate = '';

  const thStyle: React.CSSProperties = {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-muted, #4b5563)',
    borderBottom: '1px solid var(--color-border, #e5e7eb)',
    background: 'var(--color-bg-subtle, #f9fafb)',
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--color-text, #111827)',
    borderBottom: '1px solid var(--color-border, #f3f4f6)',
  };

  const numStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <Panel
      flush
      title="Density Register Log"
      action={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="input"
            style={{ height: 30, fontSize: 12, minWidth: 130 }}
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
            className="input"
            style={{ height: 30, fontSize: 12, minWidth: 120 }}
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
        <div style={{ padding: 32 }}>
          <EmptyState
            title="No density readings"
            description="No density readings match the selected filters."
          />
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Product</th>
                <th style={thStyle}>Routine</th>
                <th style={thStyle}>Sampled from</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Hydrometer</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Temp</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>At 15 °C</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Δ previous</th>
                <th style={thStyle}>Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const showDate = r.businessDate !== lastDate;
                lastDate = r.businessDate;

                const time = new Date(r.recordedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const sampledLabel =
                  r.tankName ||
                  r.nozzleName ||
                  (r.sampledFrom ? r.sampledFrom : '—');

                const kindTone =
                  r.kind === 'DECANTATION'
                    ? 'info'
                    : r.kind === 'MORNING'
                      ? 'brand'
                      : 'neutral';

                return (
                  <tr
                    key={r.id}
                    style={
                      showDate
                        ? { borderTop: '2px solid var(--color-border, #e5e7eb)' }
                        : undefined
                    }
                  >
                    <td style={{ ...tdStyle, fontWeight: showDate ? 600 : 400 }}>
                      {showDate ? r.businessDate : ''}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted, #6b7280)' }}>
                      {time}
                    </td>
                    <td style={tdStyle}>
                      <strong>{r.productName || r.productId}</strong>{' '}
                      <span style={{ opacity: 0.6 }}>· {r.productCode}</span>
                    </td>
                    <td style={tdStyle}>
                      <Chip size="sm" tone={kindTone}>
                        {r.kind}
                      </Chip>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted, #4b5563)' }}>
                      {sampledLabel}
                    </td>
                    <td style={numStyle}>
                      {r.observedDensity != null ? r.observedDensity.toFixed(1) : '—'}
                    </td>
                    <td style={numStyle}>
                      {r.observedTempC != null ? `${r.observedTempC.toFixed(1)} °C` : '—'}
                    </td>
                    <td
                      style={{
                        ...numStyle,
                        fontWeight: 700,
                        color: 'var(--color-text, #111827)',
                      }}
                    >
                      {r.density15.toFixed(2)}
                    </td>
                    <td style={numStyle}>
                      <DeltaChip
                        delta={r.delta}
                        kind={r.kind}
                        flags={r.flags}
                        tolerance={tolerance}
                      />
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: 'var(--color-text-muted, #6b7280)',
                        fontSize: 12,
                      }}
                    >
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
