import React from 'react';
import { Chip, VarianceChip } from '../../../pump-ds/index.js';
import { KV, LineTag, Notice } from './StepSection.js';
import { formatQuantity } from '../../../utils/format.js';
import { lineLabel, type StepProps } from './stepShared.js';

export const ReviewStep: React.FC<StepProps> = ({ values, tanks, flags, review }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Per invoice</div>
      {review.invoices.length === 0 && review.unlinkedProductIds.length === 0 && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No invoices linked.</span>
      )}
      {review.invoices.map((inv) => (
        <div key={inv.productId} style={{ marginBottom: 6 }}>
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <VarianceChip size="sm" kind="stock" amount={inv.variance} />
                    {inv.outOfTolerance && (
                      <Chip size="sm" tone="danger">
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
        <Chip key={p} size="sm" tone="warning">
          {tanks.find((t) => t.productId === p)?.productName}: purchase not linked
        </Chip>
      ))}
    </div>
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Per tank</div>
      {values.lines.map((l, i) => {
        const r = review.lines[i];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span style={{ width: 140 }}>
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
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Flags</div>
      {flags.flags.length === 0 ? (
        <Chip size="sm" tone="success">
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
