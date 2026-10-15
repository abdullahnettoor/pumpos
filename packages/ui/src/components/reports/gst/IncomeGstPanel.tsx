import React, { useMemo, useState } from 'react';
import { useIncomeGstRegister } from '../../../query/hooks.js';
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

interface IncomeGstRow {
  id: string;
  entryDate?: string | null;
  categoryName?: string | null;
  hsnCode?: string | null;
  payer?: string | null;
  description?: string | null;
  gstRate?: number | string | null;
  interState?: boolean;
  taxableAmount?: number | string | null;
  cgst?: number | string | null;
  sgst?: number | string | null;
  igst?: number | string | null;
  cess?: number | string | null;
  amount?: number | string | null;
}

const figure = (v: number | string | null | undefined) => Number(v || 0);

const COLUMNS: TableColumn<IncomeGstRow>[] = [
  { id: 'date', header: 'Date', kind: 'date', value: (r) => r.entryDate, width: '11%' },
  {
    id: 'category',
    header: 'Category',
    kind: 'text',
    emphasis: true,
    value: (r) => r.categoryName,
    cell: (r) => (
      <span className="flex flex-col leading-tight">
        <span className="text-ink-strong">{r.categoryName}</span>
        {r.hsnCode && (
          <span className="font-mono text-[12px] font-normal text-ink-muted">
            HSN/SAC {r.hsnCode}
          </span>
        )}
      </span>
    ),
  },
  {
    id: 'payer',
    header: 'Payer / Description',
    kind: 'text',
    value: (r) => r.payer || r.description,
  },
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
  {
    id: 'received',
    header: 'Received',
    kind: 'money',
    value: (r) => figure(r.amount),
    cell: (r) => <span className="text-ink-strong">{formatMoney(figure(r.amount))}</span>,
  },
];

/**
 * GST → Income: output GST collected on other income. Shown in Reports → GST
 * and, for Staff (no Reports), on the Income page's GST tab (#540, #529).
 *
 * Layout A (#567): one control bar drives the tiles and the register. A new
 * range applies at once; there is no Apply step.
 */
export const IncomeGstPanel: React.FC<{
  selectedStation: any | null;
  /** Controlled period (shared across the GST views). Omitted = own state. */
  range?: DateRange;
  onRangeChange?: (range: DateRange) => void;
}> = ({ selectedStation, range, onRangeChange }) => {
  const stationId = selectedStation?.id ?? null;
  const timeZone = selectedStation?.settings?.timezone;
  // Office records are dated by entry date: the plain station calendar date (ADR 0005).
  const entryClock = useMemo(() => ({ timeZone }), [timeZone]);

  const [ownRange, setOwnRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  const gstRange = range ?? ownRange;
  const setGstRange = onRangeChange ?? setOwnRange;
  // Mounted only while this GST view is showing, so the query runs only then.
  const gstQ = useIncomeGstRegister(
    { stationId, from: gstRange.from, to: gstRange.to },
    { enabled: !!stationId },
  );
  const gstRows = useMemo<IncomeGstRow[]>(() => gstQ.data ?? [], [gstQ.data]);

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
  const outputTotal = totals.cgst + totals.sgst + totals.igst + totals.cess;

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
          <InfoTip label="About income GST" placement="bottom">
            Output GST you collected on other income (rentals, commissions, advertising). The split
            is frozen from the category&rsquo;s GST rate at the time each entry was recorded. Voided
            entries are excluded.
          </InfoTip>
        }
      />

      <DataSection title="GST totals" query={gstQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile label="Taxable value" value={formatMoney(totals.taxable)} hint="net of GST" />
          <KpiTile
            label="CGST + SGST"
            value={formatMoney(totals.cgst + totals.sgst)}
            hint="intra-state"
          />
          <KpiTile label="IGST" value={formatMoney(totals.igst)} hint="inter-state" />
          <KpiTile
            label="Output GST"
            value={formatMoney(outputTotal)}
            hint={`${gstRows.length} ${gstRows.length === 1 ? 'entry' : 'entries'}`}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader title="GST register" />
        <DataSection
          title="GST register"
          query={gstQ}
          placeholderHeight={160}
          flush
          isEmpty={gstRows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="percent" size="md" />}
                title="No GST income in this period"
                description="Income only appears here when its category carries a GST rate."
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
            title="GST register"
          />
        </DataSection>
      </section>
    </div>
  );
};
