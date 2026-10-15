import React from 'react';
import { Chip, Icon, StatusChip } from '../../../pump-ds/index.js';
import { cn } from '../../../pump-ds/lib/cn.js';
import type { LinkablePurchase } from '@pump/shared';
import { formatDate, formatDensity, formatQuantity } from '../../../utils/format.js';

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
  if (loading) return <div className="text-[12px] text-ink-muted">Loading purchases…</div>;
  if (purchases.length === 0)
    return (
      <div className="text-[12px] text-ink-muted">
        No Fuel Purchase recorded for this product yet. You can link it later.
      </div>
    );
  const ordered = [...purchases].sort(
    (a, b) => Number(b.awaitingDecantation) - Number(a.awaitingDecantation),
  );
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ordered.map((p) => {
        const on = p.purchaseId === selectedId;
        return (
          // A toggle card (pick / clear), not an action: stays a native pressed button.
          <button
            key={p.purchaseId}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? '' : p.purchaseId)}
            className={cn(
              'cursor-pointer rounded-input border px-2.5 py-2 text-left text-[12px] text-ink',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
              on
                ? 'border-brand bg-brand/10'
                : 'border-border-soft bg-surface hover:bg-surface-alt',
            )}
          >
            <div className="flex justify-between gap-2 font-semibold">
              <span className="inline-flex items-center gap-1">
                {on && <Icon name="check" size="xs" className="text-brand" aria-hidden="true" />}
                {p.invoiceNumber || p.documentNumber}
              </span>
              <span className="tabular-nums">{formatQuantity(p.invoiceQty, 'L')}</span>
            </div>
            <div className="flex justify-between gap-2 text-ink-muted">
              <span>
                {p.supplierName ?? '—'} · {formatDate(p.entryDate)}
              </span>
              <span className="tabular-nums">
                {p.invoiceDensity != null
                  ? `${formatDensity(p.invoiceDensity)} kg/m³`
                  : 'no density'}
              </span>
            </div>
            {(p.awaitingDecantation || p.linkedDecantationCount > 0) && (
              <div className="mt-1 flex gap-1">
                {p.awaitingDecantation && <StatusChip status="awaiting-decantation" size="xs" />}
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
