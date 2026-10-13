import React from 'react';
import { Chip } from '../../../pump-ds/index.js';
import type { LinkablePurchase } from '@pump/shared';
import { formatQuantity } from '../../../utils/format.js';

/**
 * Fuel Purchase cards of one product. One invoice per product per tanker visit:
 * picking another replaces the pick; picking the picked one clears it.
 */
export const PurchaseCards: React.FC<{
  purchases: LinkablePurchase[];
  selectedId: string;
  onSelect: (purchaseId: string) => void;
  loading?: boolean;
}> = ({ purchases, selectedId, onSelect, loading }) => {
  if (loading)
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading purchases…</div>;
  if (purchases.length === 0)
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        No Fuel Purchase recorded for this product yet. You can link it later.
      </div>
    );
  const ordered = [...purchases].sort(
    (a, b) => Number(b.awaitingDecantation) - Number(a.awaitingDecantation),
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {ordered.map((p) => {
        const on = p.purchaseId === selectedId;
        return (
          <button
            key={p.purchaseId}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? '' : p.purchaseId)}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-strong)',
              border: `1px solid ${on ? 'var(--brand-primary)' : 'var(--border-soft)'}`,
              background: on
                ? 'color-mix(in oklab, var(--brand-primary) 8%, transparent)'
                : 'var(--bg-surface)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
              <span>
                {on ? '✓ ' : ''}
                {p.invoiceNumber || p.documentNumber}
              </span>
              <span>{formatQuantity(p.invoiceQty, 'L')}</span>
            </div>
            <div
              style={{
                color: 'var(--text-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span>
                {p.supplierName ?? '—'} · {p.entryDate}
              </span>
              <span>{p.invoiceDensity != null ? `${p.invoiceDensity} kg/m³` : 'no density'}</span>
            </div>
            {(p.awaitingDecantation || p.linkedDecantationCount > 0) && (
              <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                {p.awaitingDecantation && (
                  <Chip tone="warning" size="xs" variant="soft">
                    Awaiting decantation
                  </Chip>
                )}
                {p.linkedDecantationCount > 0 && (
                  <Chip tone="neutral" size="xs" variant="soft">
                    Linked to {p.linkedDecantationCount}
                  </Chip>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
