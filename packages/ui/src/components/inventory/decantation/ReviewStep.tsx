import React from 'react';
import { Chip, StatusChip, VarianceChip } from '../../../pump-ds/index.js';
import { KV, LineTag, Notice } from './StepSection.js';
import { formatQuantity } from '../../../utils/format.js';
import { lineLabel, type StepProps } from './stepShared.js';

export const ReviewStep: React.FC<StepProps> = ({ values, tanks, flags, review }) => (
  <div className="flex flex-col gap-3">
    <div>
      <div className="mb-1.5 text-[12px] font-semibold">Per invoice</div>
      {review.invoices.length === 0 && review.unlinkedProductIds.length === 0 && (
        <span className="text-[12px] text-ink-muted">No invoices linked.</span>
      )}
      {review.invoices.map((inv) => (
        <div key={inv.productId} className="mb-1.5">
          <KV
            items={[
              ['Product', tanks.find((t) => t.productId === inv.productId)?.productName ?? '—'],
              ['Invoice', formatQuantity(inv.invoiceQty, 'L')],
              [
                'Received',
                inv.received != null ? formatQuantity(inv.received, 'L') : 'Pending measurement',
              ],
              [
                'Variance',
                inv.variance == null ? (
                  '—'
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <VarianceChip size="md" kind="stock" amount={inv.variance} />
                    {inv.outOfTolerance && (
                      <Chip size="md" tone="danger">
                        Out of tolerance
                      </Chip>
                    )}
                  </span>
                ),
              ],
            ]}
          />
        </div>
      ))}
      {review.unlinkedProductIds.map((p) => (
        <StatusChip
          key={p}
          status="purchase-not-linked"
          size="md"
          label={`${tanks.find((t) => t.productId === p)?.productName}: purchase not linked`}
        />
      ))}
    </div>
    <div>
      <div className="mb-1.5 text-[12px] font-semibold">Per tank</div>
      {values.lines.map((l, i) => {
        const r = review.lines[i];
        return (
          <div key={i} className="mb-1.5 flex items-center gap-3">
            <span className="w-[140px] shrink-0">
              <LineTag i={i} label={lineLabel(tanks, l.tankId, i)} />
            </span>
            <KV
              items={[
                ['Before', formatQuantity(r?.beforeDip, 'L')],
                ['Received', r?.received != null ? formatQuantity(r.received, 'L') : 'Pending'],
                [
                  'Stock after',
                  r?.afterDip != null ? formatQuantity(r.afterDip, 'L') : 'Next Tank Dip',
                ],
              ]}
            />
          </div>
        );
      })}
    </div>
    <div>
      <div className="mb-1.5 text-[12px] font-semibold">Flags</div>
      {flags.flags.length === 0 ? (
        <Chip size="md" tone="success">
          Nothing flagged
        </Chip>
      ) : (
        flags.flags.map((f, i) => (
          <Notice key={i} tone="danger">
            {f.message}
          </Notice>
        ))
      )}
    </div>
  </div>
);
