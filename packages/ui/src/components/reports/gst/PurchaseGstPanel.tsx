import React, { useMemo, useState } from 'react';
import { usePurchaseGstRegister } from '../../../query/hooks.js';
import { formatMoney } from '../../../utils/format.js';
import { InfoTip } from '../../primitives/InfoTip.js';
import {
  ControlBar,
  DataSection,
  DateRangeMenu,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  computeRange,
  type DateRange,
  type TableColumn,
} from '../../../pump-ds/index.js';

interface PurchaseGstRow {
  id: string;
  entryDate?: string | null;
  businessDate?: string | null;
  supplierName?: string | null;
  supplierGstin?: string | null;
  invoiceNumber?: string | null;
  documentNumber?: string | null;
  productName?: string | null;
  productCode?: string | null;
  gstRate?: number | string | null;
  taxableAmount?: number | string | null;
  cgst?: number | string | null;
  sgst?: number | string | null;
  igst?: number | string | null;
  cess?: number | string | null;
  lineTotal?: number | string | null;
}

const figure = (v: number | string | null | undefined) => Number(v || 0);

const COLUMNS: TableColumn<PurchaseGstRow>[] = [
  {
    id: 'date',
    header: 'Date',
    kind: 'date',
    value: (r) => r.entryDate ?? r.businessDate,
    width: '10%',
  },
  {
    id: 'supplier',
    header: 'Supplier',
    kind: 'text',
    value: (r) => r.supplierName,
    cell: (r) => (
      <span className="flex flex-col leading-tight">
        <span className="font-semibold text-ink-strong">{r.supplierName}</span>
        {r.supplierGstin && (
          <span className="font-mono text-[12px] text-ink-muted">{r.supplierGstin}</span>
        )}
      </span>
    ),
  },
  {
    id: 'invoice',
    header: 'Invoice',
    kind: 'text',
    value: (r) => r.invoiceNumber || r.documentNumber,
  },
  {
    id: 'product',
    header: 'Product',
    kind: 'text',
    value: (r) => r.productName,
    cell: (r) => (
      <span className="flex flex-col leading-tight">
        <span className="text-ink-default">{r.productName}</span>
        {r.productCode && (
          <span className="font-mono text-[12px] text-ink-muted">{r.productCode}</span>
        )}
      </span>
    ),
  },
  {
    id: 'rate',
    header: 'Rate',
    kind: 'text',
    value: (r) => figure(r.gstRate),
    cell: (r) => <span className="font-mono text-ink-muted">{figure(r.gstRate)}%</span>,
    width: '6%',
  },
  { id: 'taxable', header: 'Taxable', kind: 'money', value: (r) => figure(r.taxableAmount) },
  { id: 'cgst', header: 'CGST', kind: 'money', value: (r) => figure(r.cgst) },
  { id: 'sgst', header: 'SGST', kind: 'money', value: (r) => figure(r.sgst) },
  { id: 'igst', header: 'IGST', kind: 'money', value: (r) => figure(r.igst) },
  {
    id: 'total',
    header: 'Total',
    kind: 'money',
    value: (r) => figure(r.lineTotal),
    cell: (r) => <span className="text-ink-strong">{formatMoney(figure(r.lineTotal))}</span>,
  },
];

/**
 * GST → Purchases (ITC): input credit on GST purchase lines. Moved from the old
 * Purchases "GST / ITC" tab into the one GST report (#540).
 *
 * Layout A (#567), as Income GST: one control bar drives the tiles and the
 * register. A new range applies at once; there is no Apply step.
 */
export const PurchaseGstPanel: React.FC<{
  selectedStation: any | null;
  /** Controlled period (shared across the GST views). Omitted = own state. */
  range?: DateRange;
  onRangeChange?: (range: DateRange) => void;
}> = ({ selectedStation, range, onRangeChange }) => {
  const stationId = selectedStation?.id ?? null;
  const timeZone = selectedStation?.settings?.timezone;
  // Station-timezone calendar dates, never UTC (#288).
  const entryClock = useMemo(() => ({ timeZone }), [timeZone]);

  const [ownRange, setOwnRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  const gstRange = range ?? ownRange;
  const setGstRange = onRangeChange ?? setOwnRange;
  // Mounted only while this GST view is showing, so the query runs only then.
  const gstQ = usePurchaseGstRegister({ from: gstRange.from, to: gstRange.to }, stationId ?? '', {
    enabled: !!stationId,
  });
  const gstRows = useMemo<PurchaseGstRow[]>(() => gstQ.data ?? [], [gstQ.data]);

  const totals = useMemo(
    () =>
      gstRows.reduce(
        (acc, r) => ({
          taxable: acc.taxable + figure(r.taxableAmount),
          cgst: acc.cgst + figure(r.cgst),
          sgst: acc.sgst + figure(r.sgst),
          igst: acc.igst + figure(r.igst),
          cess: acc.cess + figure(r.cess),
        }),
        { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
      ),
    [gstRows],
  );
  const itcTotal = totals.cgst + totals.sgst + totals.igst + totals.cess;
  const lines = `${gstRows.length} ${gstRows.length === 1 ? 'line' : 'lines'}`;

  return (
    <div className="flex flex-col gap-4">
      <ControlBar
        range={
          <DateRangeMenu
            value={gstRange}
            onChange={setGstRange}
            clock={entryClock}
            aria-label="GST period"
          />
        }
        info={
          <InfoTip label="About purchase GST" placement="bottom">
            Input GST credit (ITC) on GST purchase lines. Fuel (VAT) and exempt items carry no input
            credit and are excluded.
          </InfoTip>
        }
      />

      <DataSection title="GST totals" query={gstQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile
            label="Taxable value"
            scope="in-range"
            value={formatMoney(totals.taxable)}
            hint="net of GST"
          />
          <KpiTile
            label="CGST + SGST"
            scope="in-range"
            value={formatMoney(totals.cgst + totals.sgst)}
            hint="intra-state"
          />
          <KpiTile
            label="IGST"
            scope="in-range"
            value={formatMoney(totals.igst)}
            hint="inter-state"
          />
          <KpiTile
            label="Input credit (ITC)"
            scope="in-range"
            value={formatMoney(itcTotal)}
            hint={totals.cess > 0 ? `${lines}, incl. ${formatMoney(totals.cess)} cess` : lines}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader title="ITC register" />
        <DataSection
          title="ITC register"
          query={gstQ}
          placeholderHeight={160}
          flush
          isEmpty={gstRows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="percent" size="md" />}
                title="No GST purchases in this period"
                description="Only purchase lines that carry GST appear here."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={COLUMNS}
            rows={gstRows}
            rowKey={(r) => r.id}
            totalRow
            title="ITC register"
          />
        </DataSection>
      </section>
    </div>
  );
};
