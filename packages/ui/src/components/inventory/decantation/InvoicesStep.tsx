import React from 'react';
import type { LinkablePurchase } from '@pump/shared';
import { Chip } from '../../../pump-ds/index.js';
import { Field, TextInput } from '../../primitives/Field.js';
import { PurchaseCards } from './PurchaseCards.js';
import { UnlinkButton } from './UnlinkButton.js';
import { KV } from './StepSection.js';
import { fmtLitres } from './format.js';
import { grid, tankOf, SummaryCard, type StepProps } from './stepShared.js';

export const InvoicesStep: React.FC<
  StepProps & {
    purchases: Record<string, { data: LinkablePurchase[]; loading: boolean }>;
    fuelProducts: { id: string; name: string }[];
    /** productId → purchaseId already saved on the server (can be unlinked). */
    savedLinks?: Record<string, string>;
    unlinkBusy?: boolean;
    onUnlink?: (productId: string) => void;
  }
> = ({ form, values, purchases, fuelProducts, savedLinks = {}, unlinkBusy, onUnlink }) => {
  const { register, formState, setValue } = form;
  return (
    <>
      <div style={grid('1fr 1fr')}>
        <Field label="Tanker no." required error={formState.errors.tankerNumber?.message}>
          <TextInput
            aria-label="Tanker no."
            placeholder="KL-07-CB-4412"
            invalid={!!formState.errors.tankerNumber}
            {...register('tankerNumber')}
          />
        </Field>
        <Field label="Driver">
          <TextInput aria-label="Driver" {...register('driverName')} />
        </Field>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, margin: '2px 0 6px' }}>
        Fuel Purchases on this tanker{' '}
        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
          · one per product · optional, can link later
        </span>
      </div>
      {fuelProducts.map((p) => (
        <div key={p.id} style={{ marginBottom: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: 'var(--text-muted)',
              marginBottom: 4,
            }}
          >
            <span>{p.name}</span>
            {onUnlink && savedLinks[p.id] && values.links[p.id] === savedLinks[p.id] && (
              <UnlinkButton label={p.name} busy={unlinkBusy} onConfirm={() => onUnlink(p.id)} />
            )}
          </div>
          <PurchaseCards
            purchases={purchases[p.id]?.data ?? []}
            loading={purchases[p.id]?.loading}
            selectedId={values.links[p.id] ?? ''}
            onSelect={(purchaseId) =>
              setValue('links', { ...values.links, [p.id]: purchaseId }, { shouldDirty: true })
            }
          />
        </div>
      ))}
    </>
  );
};

export const InvoicesSummary: React.FC<
  StepProps & { purchases: Record<string, { data: LinkablePurchase[] }> }
> = ({ values, tanks, purchases }) => {
  const picked = Object.entries(values.links)
    .filter(([, id]) => id)
    .map(([productId, id]) => ({
      productId,
      purchase: purchases[productId]?.data.find((x) => x.purchaseId === id),
    }));
  const productIds = [...new Set(values.lines.map((l) => tankOf(tanks, l.tankId)?.productId))];
  const unlinked = productIds.filter((p) => p && !values.links[p]);
  return (
    <SummaryCard>
      <KV
        items={[
          ['Tanker', values.tankerNumber || '—'],
          ['Driver', values.driverName || '—'],
        ]}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {picked.map(({ productId, purchase }) => (
          <Chip key={productId} size="sm" tone="neutral">
            {tanks.find((t) => t.productId === productId)?.productName} ·{' '}
            {purchase?.invoiceNumber || purchase?.documentNumber || 'linked'}
            {purchase ? ` · ${fmtLitres(purchase.invoiceQty)}` : ''}
            {purchase?.invoiceDensity != null ? ` · ${purchase.invoiceDensity} kg/m³` : ''}
          </Chip>
        ))}
        {unlinked.map((p) => (
          <Chip key={p} size="sm" tone="warning">
            {tanks.find((t) => t.productId === p)?.productName}: purchase not linked
          </Chip>
        ))}
      </div>
    </SummaryCard>
  );
};
