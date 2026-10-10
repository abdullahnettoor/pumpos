import React from 'react';
import { generateShiftSummaryPdf, useToast } from '@pump/ui';
import type { Station } from '@pump/shared';
import { SalesByProduct } from '../components/SalesByProduct.js';
import { businessDateLabel } from '../lib/home/dates.js';
import { rupees, signedRupees } from '../lib/home/format.js';
import type { ShiftSummaryRow } from '../lib/shifts/history.js';
import { derivePaymentSlices } from '../lib/shifts/summary.js';
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
 * A closed Shift's full summary, from its immutable Shift Summary snapshot:
 * total sales and cash variance, payment split, sales by product, nozzle
 * readings and drawer reconciliation. Share and Download produce the same PDF
 * the desktop Shift Summary does. Push it with
 * `nav.push(<ShiftSummaryPage station={station} shiftId={id} />, `shift:${id}`)`.
 */
export const ShiftSummaryPage: React.FC<Props> = ({ station, shiftId, initial }) => {
  const toast = useToast();
  const { model, products, productsLoading, productsError, summariesLoading } = useShiftSummary(
    station,
    shiftId,
    initial,
  );

  if (!model)
    return (
      <DetailPage title="Shift summary">
        <p className="px-4 py-10 text-center text-sm text-text-muted">
          {summariesLoading ? 'Loading shift summary…' : 'This shift summary is not available.'}
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

  // Total sales = fuel from the snapshot + Product Sales read live (null until they have loaded).
  const productsTotal = products ? products.total : null;
  const total = f.fuelValue + (productsTotal ?? 0);
  const v = f.variance;
  const productsNote = productsLoading
    ? 'Loading…'
    : productsError
      ? 'Unavailable'
      : 'Product sales';

  return (
    <DetailPage
      title={`${model.title} summary`}
      subtitle={[row.businessDate ? businessDateLabel(String(row.businessDate)) : '', model.window]
        .filter(Boolean)
        .join(' · ')}
      right={<StatusBadge tone="good">{row.status === 'LOCKED' ? 'Locked' : 'Closed'}</StatusBadge>}
      share={{ onPress: () => pdf('save') }}
      download={{ onPress: () => pdf('download'), label: 'Download PDF' }}
      onActionError={(message) => toast.error(message)}
    >
      <div className="grid grid-cols-2 gap-2 px-3">
        <StatTile
          wide
          label="Total sales"
          note={`Shift ${model.code}`}
          value={rupees(total)}
          sub={[
            f.fuelVolumeLabel,
            productsTotal === null ? undefined : `products ${rupees(productsTotal)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          trailing={
            <div className="flex-shrink-0 text-right">
              <p className="text-[11px] font-medium text-text-muted">Cash variance</p>
              <p
                className={`num mt-1 text-lg font-semibold ${
                  v.headline === 0
                    ? 'text-text-high'
                    : v.headline < 0
                      ? 'text-bad-fg'
                      : 'text-warn-fg'
                }`}
              >
                {v.headline > 0 ? '+' : ''}
                {signedRupees(v.headline)}
              </p>
              <p className="mt-0.5 text-[11px] text-text-muted">{v.headlineNote}</p>
            </div>
          }
        />
      </div>

      <SectionLabel>Payments</SectionLabel>
      <PaymentSplit
        slices={derivePaymentSlices(f.payments, productsLoading || productsError ? null : total)}
      />

      <SectionLabel>Sales by product</SectionLabel>
      <SalesByProduct
        fuel={f.fuel}
        products={products?.lines ?? []}
        fuelTotal={f.fuelValue}
        productsTotal={productsTotal ?? 0}
        fuelNote={{ text: 'From nozzle readings' }}
        productsNote={{ text: productsNote }}
        fuelEmpty="No fuel sales in this shift."
        productsEmpty={
          productsLoading
            ? 'Loading product sales…'
            : productsError
              ? 'Product sales could not be loaded.'
              : 'No product sales in this shift.'
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
