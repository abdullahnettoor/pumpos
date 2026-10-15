import React, { useMemo, useState } from 'react';
import { useSalesTaxRegister } from '../../query/hooks.js';
import { formatDate, formatMoney } from '../../utils/format.js';
import { salesTaxTotals } from './totals/reportTotals.js';
import { InfoTip } from '../primitives/InfoTip.js';
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
} from '../../pump-ds/index.js';

export interface TaxRegisterPanelProps {
  selectedStation: any | null;
  /** Controlled period (shared across the GST views). Omitted = own state. */
  range?: DateRange;
  onRangeChange?: (range: DateRange) => void;
}

interface SalesTaxRow {
  id: string;
  businessDate?: string | null;
  documentNumber?: string | null;
  productName?: string | null;
  hsnCode?: string | null;
  customerName?: string | null;
  quantity?: number | string | null;
  taxCategory?: string | null;
  gstRate?: number | string | null;
  vatRate?: number | string | null;
  interState?: boolean;
  taxableAmount?: number | string | null;
  cgst?: number | string | null;
  sgst?: number | string | null;
  igst?: number | string | null;
  vat?: number | string | null;
  cess?: number | string | null;
  lineTotal?: number | string | null;
}

const figure = (v: number | string | null | undefined) => Number(v || 0);

const GST_COLUMNS: TableColumn<SalesTaxRow>[] = [
  {
    id: 'date',
    header: 'Date',
    kind: 'date',
    value: (r) => r.businessDate,
    width: '11%',
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.businessDate)}</span>,
  },
  { id: 'document', header: 'Document', kind: 'text', value: (r) => r.documentNumber },
  {
    id: 'product',
    header: 'Product',
    width: '20%',
    kind: 'text',
    value: (r) => r.productName,
    cell: (r) => (
      <span className="flex flex-col leading-tight">
        <span className="font-semibold text-ink-strong">{r.productName}</span>
        {r.hsnCode && (
          <span className="font-mono text-[12px] font-normal text-ink-muted">HSN {r.hsnCode}</span>
        )}
      </span>
    ),
  },
  { id: 'buyer', header: 'Buyer', kind: 'text', value: (r) => r.customerName },
  {
    id: 'rate',
    header: 'Rate',
    kind: 'text',
    value: (r) => figure(r.gstRate),
    cell: (r) => (
      <span className="font-mono text-ink-muted">
        {figure(r.gstRate)}%{r.interState ? ' · IGST' : ''}
      </span>
    ),
  },
  { id: 'taxable', header: 'Taxable', kind: 'money', value: (r) => figure(r.taxableAmount) },
  { id: 'cgst', header: 'CGST', kind: 'money', value: (r) => figure(r.cgst) },
  { id: 'sgst', header: 'SGST', kind: 'money', value: (r) => figure(r.sgst) },
  { id: 'igst', header: 'IGST', kind: 'money', value: (r) => figure(r.igst) },
  { id: 'total', header: 'Total', kind: 'money', value: (r) => figure(r.lineTotal) },
];

const VAT_COLUMNS: TableColumn<SalesTaxRow>[] = [
  {
    id: 'date',
    header: 'Date',
    kind: 'date',
    value: (r) => r.businessDate,
    width: '11%',
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.businessDate)}</span>,
  },
  { id: 'document', header: 'Document', kind: 'text', value: (r) => r.documentNumber },
  {
    id: 'product',
    header: 'Product',
    width: '20%',
    kind: 'text',
    value: (r) => r.productName,
    cell: (r) => <span className="font-semibold text-ink-strong">{r.productName}</span>,
  },
  // Fuel is sold by the litre.
  { id: 'qty', header: 'Qty', kind: 'qty', unit: 'L', value: (r) => figure(r.quantity) },
  {
    id: 'rate',
    header: 'Rate',
    kind: 'text',
    value: (r) => figure(r.vatRate),
    cell: (r) => <span className="font-mono text-ink-muted">{figure(r.vatRate)}%</span>,
  },
  { id: 'taxable', header: 'Taxable', kind: 'money', value: (r) => figure(r.taxableAmount) },
  { id: 'vat', header: 'VAT', kind: 'money', value: (r) => figure(r.vat) },
  { id: 'total', header: 'Total', kind: 'money', value: (r) => figure(r.lineTotal) },
];

/**
 * Output-tax register (Phase T5). The day's/period's tax **collected**, split by
 * the regime it belongs to:
 *  - **GST** on merchandise/lubes — creditable to the buyer. Output GST on
 *    other income is its own GST view (Income), so it is not repeated here.
 *  - **VAT** on fuel — outside GST, no input credit, so it is reported on its own
 *    line and never folded into the GST totals.
 * Every figure is read from the split frozen on the source row at capture, so a
 * later rate change can never restate a closed period.
 *
 * Layout A (#531): one control bar drives the tiles and both registers.
 */
export const TaxRegisterPanel: React.FC<TaxRegisterPanelProps> = ({
  selectedStation,
  range: rangeProp,
  onRangeChange,
}) => {
  const s = selectedStation?.settings || {};
  const timeZone = s.timezone;
  const dayStartsAt = s.business_day_starts_at;
  // Sales are anchored to the business day, so the range follows the Day Start.
  const clock = useMemo(() => ({ timeZone, dayStartsAt }), [timeZone, dayStartsAt]);
  const [ownRange, setOwnRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const range = rangeProp ?? ownRange;
  const setRange = onRangeChange ?? setOwnRange;
  const stationId = selectedStation?.id ?? null;

  const salesQ = useSalesTaxRegister({ stationId, from: range.from, to: range.to });

  // Memoised so the totals below actually memoise: a bare `?? []` hands the
  // dependency list a new array on every render while the query is loading.
  const saleRows = useMemo<SalesTaxRow[]>(() => salesQ.data ?? [], [salesQ.data]);
  const gstSaleRows = useMemo(() => saleRows.filter((r) => r.taxCategory === 'GST'), [saleRows]);
  const vatSaleRows = useMemo(
    () => saleRows.filter((r) => r.taxCategory === 'FUEL_VAT'),
    [saleRows],
  );

  const totals = useMemo(() => salesTaxTotals(saleRows), [saleRows]);

  if (!selectedStation) {
    return (
      <EmptyState
        compact
        icon={<Icon name="percent" size="md" />}
        title="No station selected"
        description="Select a station to view the tax register."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ControlBar
        range={
          <DateRangeMenu value={range} onChange={setRange} clock={clock} aria-label="GST period" />
        }
        info={
          <InfoTip label="About the sales tax register" placement="bottom">
            Output tax collected on sales. GST on products is creditable to the buyer. Fuel VAT is
            outside GST, carries no input credit and is reported separately. Each figure is the
            split frozen on the sale line when it was recorded.
          </InfoTip>
        }
      />

      <DataSection title="Output tax totals" query={salesQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile
            label="Output GST (products)"
            value={formatMoney(totals.gstOutput)}
            hint={`${gstSaleRows.length} ${gstSaleRows.length === 1 ? 'line' : 'lines'}`}
          />
          <KpiTile
            label="Output VAT (fuel)"
            value={formatMoney(totals.vat)}
            hint="no input credit"
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader title="GST on product sales" />
        <DataSection
          title="GST on product sales"
          query={salesQ}
          placeholderHeight={160}
          flush
          isEmpty={gstSaleRows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="percent" size="md" />}
                title="No GST sales in this period"
                description="Product lines appear here once their product carries a GST rate."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            dense
            columns={GST_COLUMNS}
            rows={gstSaleRows}
            rowKey={(r) => r.id}
            totalRow
            title="GST on product sales"
          />
        </DataSection>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="VAT on fuel sales" />
        <DataSection
          title="VAT on fuel sales"
          query={salesQ}
          placeholderHeight={160}
          flush
          isEmpty={vatSaleRows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="percent" size="md" />}
                title="No VAT fuel lines in this period"
                description="Fuel lines appear here once the product carries a VAT rate."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            dense
            columns={VAT_COLUMNS}
            rows={vatSaleRows}
            rowKey={(r) => r.id}
            totalRow
            title="VAT on fuel sales"
          />
        </DataSection>
      </section>
    </div>
  );
};
