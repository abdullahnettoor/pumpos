import React from 'react';
import { generateShiftSummaryPdf, useToast } from '@pump/ui';
import type { Station } from '@pump/shared';
import { CashVarianceCard } from '../components/CashVarianceCard.js';
import { SalesByProduct } from '../components/SalesByProduct.js';
import { businessDateLabel } from '../lib/dates.js';
import { rupees, signedRupees } from '../lib/format.js';
import type { ShiftSummaryRow } from '../lib/shifts/history.js';
import { shiftCashVariance } from '../lib/cashVariance.js';
import { derivePaymentSplit } from '../lib/shifts/summary.js';
import { DetailPage, SectionLabel, StatTile, StatusBadge } from '../ui/index.js';
import { DrawerReconciliation } from './shift-summary/DrawerReconciliation.js';
import { NozzleTable } from './shift-summary/NozzleTable.js';
import { PaymentSplit } from './shift-summary/PaymentSplit.js';
import { useShiftSummary } from './shift-summary/useShiftSummary.js';

interface Props {
  station: Station;
  shiftId: string;
  /** The row this page was opened from; shown at once, then replaced by the cached read. */
  initial?: ShiftSummaryRow;
}

/**
 * A closed Shift's full summary, read from its immutable Shift Summary snapshot
 * (nothing is recomputed from live data): total sales and cash variance,
 * payment split, sales by product, nozzle readings and drawer reconciliation.
 * Share and Download produce the same PDF the desktop Shift Summary does. Push
 * it with
 * `nav.push(<ShiftSummaryPage station={station} shiftId={id} />, `shift:${id}`)`.
 */
export const ShiftSummaryPage: React.FC<Props> = ({ station, shiftId, initial }) => {
  const toast = useToast();
  const { model, loading } = useShiftSummary(station, shiftId, initial);

  if (!model)
    return (
      <DetailPage title="Shift summary">
        <p className="px-4 py-10 text-center text-sm text-text-muted">
          {loading ? 'Loading shift summary…' : 'This shift summary is not available.'}
        </p>
      </DetailPage>
    );

  const { row, figures: f } = model;
  const pdf = (output: 'save' | 'download') =>
    generateShiftSummaryPdf(
      station,
      row.snapshotData,
      shiftId,
      row.templateName,
      { businessDate: row.businessDate, shiftSequence: row.shiftSequence },
      output,
    );

  const { products } = f;
  const v = f.variance;

  return (
    <DetailPage
      title={`${model.title} summary`}
      subtitle={[row.businessDate ? businessDateLabel(String(row.businessDate)) : '', model.window]
        .filter(Boolean)
        .join(' · ')}
      right={<StatusBadge tone="good">Closed</StatusBadge>}
      share={{ onPress: () => pdf('save') }}
      download={{ onPress: () => pdf('download'), label: 'Download PDF' }}
      onActionError={(message) => toast.error(message)}
    >
      <div className="grid grid-cols-2 gap-2 px-3">
        <StatTile
          wide
          label="Total sales"
          note={`Shift ${model.code}`}
          value={rupees(f.total)}
          sub={[
            f.fuelVolumeLabel,
            products === null ? undefined : `products ${rupees(products.total)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <CashVarianceCard wide variance={shiftCashVariance(v)} />
      </div>

      <SectionLabel>Payments</SectionLabel>
      <PaymentSplit split={derivePaymentSplit(f.payments, f.total, f.variance.attendant)} />

      <SectionLabel>Sales by product</SectionLabel>
      <SalesByProduct
        fuel={f.fuel}
        products={products?.lines ?? []}
        fuelTotal={f.fuelValue}
        productsTotal={products?.total ?? 0}
        fuelNote={{ text: 'From nozzle readings' }}
        productsNote={{ text: products ? 'Product sales' : 'Not recorded' }}
        fuelEmpty="No fuel sales in this shift."
        productsEmpty={
          products
            ? 'No product sales in this shift.'
            : 'This summary was saved before product sales were included.'
        }
      />

      <SectionLabel right={<span className="num">{f.fuelVolumeLabel}</span>}>
        Nozzle readings
      </SectionLabel>
      <NozzleTable nozzles={f.nozzles} />

      <SectionLabel right={f.drawers.length > 0 ? `${f.drawers.length} drawers` : undefined}>
        Drawer reconciliation
      </SectionLabel>
      <DrawerReconciliation drawers={f.drawers} office={f.office} />
      {v.twoLevel && (
        <p className="px-4 pt-2 text-[11px] text-text-muted">
          Attendant variance is each drawer against its expected cash{' '}
          <span className="num">({signedRupees(v.attendant ?? 0)})</span>. Office count is the cash
          counted at close against what the drawers declared.
        </p>
      )}
    </DetailPage>
  );
};
