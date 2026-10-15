import React, { useCallback, useMemo, useState } from 'react';
import { useSales, queryKeys } from '../../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { CloudTransactionService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';
import { computeRange } from '../../pump-ds/date-range/index.js';
import type { DateRange } from '../../pump-ds/date-range/index.js';
import { paperFromStation } from '../../services/reports/reportConfig.js';
import { letterheadFromStation } from '../../services/reports/letterhead.js';
import { formatMoney } from '../../utils/format.js';
import {
  Button,
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SectionHeader,
  type TableColumn,
} from '../../pump-ds/index.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { ReportRangeBar } from './ReportRangeBar.js';

const txService = new CloudTransactionService();

export interface InvoicesPanelProps {
  selectedStation: any | null;
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
}

/**
 * GST invoices workspace (Phase T4): lists non-fuel (merchandise) sales with
 * their invoice status. Issue a tax invoice for a sale (idempotent) and download
 * the PDF, or re-download an already-issued invoice. Staff cannot issue.
 */
export const InvoicesPanel: React.FC<InvoicesPanelProps> = ({ selectedStation, userRole }) => {
  const toast = useToast();
  const qc = useQueryClient();
  const s = selectedStation?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [busyId, setBusyId] = useState<string | null>(null);

  const canIssue = userRole !== 'Staff';
  const salesQ = useSales({ stationId: selectedStation?.id, from: range.from, to: range.to });
  const sales = salesQ.data;

  // Memoised so `kpis` below actually memoises: a bare `|| []` hands the
  // dependency list a new array on every render while the query is loading.
  // Newest business date first (stable, so a day keeps the server's order).
  const rows = useMemo(
    () =>
      [...(sales || [])].sort((a, b) =>
        String(b.businessDate ?? '').localeCompare(String(a.businessDate ?? '')),
      ),
    [sales],
  );
  const kpis = useMemo(() => {
    let total = 0;
    let invoiced = 0;
    for (const r of rows) {
      total += Number(r.totalAmount || 0);
      if (r.invoiceNumber) invoiced += 1;
    }
    return { total, invoiced, pending: rows.length - invoiced };
  }, [rows]);

  const exportInvoice = useCallback(
    async (invoice: any) => {
      const [{ exportReactPdf }, { InvoiceDoc }] = await Promise.all([
        import('../../services/exportPdf.js'),
        import('../../services/reports/invoiceDoc.js'),
      ]);
      const element = React.createElement(InvoiceDoc, {
        invoice,
        stationName: selectedStation?.name,
        letterhead: letterheadFromStation(selectedStation),
        paper: paperFromStation(selectedStation),
      });
      await exportReactPdf(
        element,
        `Invoice_${String(invoice.invoiceNumber || 'draft').replace(/[^a-z0-9]+/gi, '-')}`,
      );
    },
    [selectedStation],
  );

  const handleInvoice = useCallback(
    async (saleId: string) => {
      setBusyId(saleId);
      try {
        // Idempotent: issues a new invoice or returns the existing one.
        const invoice = await txService.issueInvoice(saleId);
        await exportInvoice(invoice);
        await Promise.all([
          qc.invalidateQueries({
            queryKey: queryKeys.sales(selectedStation?.id ?? '', range.from, range.to),
          }),
          qc.invalidateQueries({ queryKey: ['invoices'] }),
        ]);
      } catch (err: any) {
        toast.error(err.message || 'Failed to generate invoice.');
      } finally {
        setBusyId(null);
      }
    },
    [exportInvoice, qc, range.from, range.to, selectedStation, toast],
  );

  const columns = useMemo<TableColumn<any>[]>(
    () => [
      { id: 'date', header: 'Date', kind: 'date', value: (r) => r.businessDate, width: '13%' },
      {
        id: 'customer',
        header: 'Customer',
        kind: 'text',
        value: (r) => r.customerName,
        cell: (r) =>
          r.customerName ? (
            <span className="text-ink-strong">{r.customerName}</span>
          ) : (
            <span className="text-ink-faint">Walk-in</span>
          ),
      },
      {
        id: 'sale',
        header: 'Sale',
        kind: 'text',
        value: (r) => r.documentNumber || r.saleType,
        cell: (r) => <span className="text-ink-muted">{r.documentNumber || r.saleType}</span>,
      },
      { id: 'amount', header: 'Amount', kind: 'money', value: (r) => r.totalAmount },
      {
        id: 'invoice',
        header: 'Invoice',
        kind: 'text',
        value: (r) => r.invoiceNumber,
        cell: (r) =>
          r.invoiceNumber ? (
            <span className="font-mono text-ink-default">{r.invoiceNumber}</span>
          ) : (
            <span className="text-ink-faint">—</span>
          ),
      },
      {
        id: 'action',
        header: '',
        kind: 'text',
        value: () => null,
        width: '10%',
        cell: (r) => (
          <Button
            variant="secondary"
            size="xs"
            leftIcon={
              r.invoiceNumber ? (
                <Icon name="download" size="xs" />
              ) : (
                <Icon name="file-text" size="xs" />
              )
            }
            loading={busyId === r.id}
            disabled={busyId === r.id || (!canIssue && !r.invoiceNumber)}
            onClick={() => handleInvoice(r.id)}
          >
            {r.invoiceNumber ? 'PDF' : 'Issue'}
          </Button>
        ),
      },
    ],
    [busyId, canIssue, handleInvoice],
  );

  return (
    <div className="flex flex-col gap-4">
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        info={
          <InfoTip label="About invoices" placement="bottom">
            Non-fuel sales only — fuel is VAT (outside GST). Issuing assigns a gapless GST invoice
            number and downloads the PDF.
          </InfoTip>
        }
      />

      <DataSection title="Invoice totals" query={salesQ} shape="cards" placeholderHeight={90}>
        <KpiStrip columns="auto">
          <KpiTile
            label="Product sales"
            value={formatMoney(kpis.total)}
            hint={`${rows.length} ${rows.length === 1 ? 'sale' : 'sales'}`}
          />
          <KpiTile label="Invoiced" value={String(kpis.invoiced)} />
          <KpiTile
            alert={kpis.pending > 0 ? 'warning' : undefined}
            label="Not invoiced"
            value={String(kpis.pending)}
          />
        </KpiStrip>
      </DataSection>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Product invoices" />
        <DataSection
          title="Product invoices"
          query={salesQ}
          placeholderHeight={200}
          flush
          isEmpty={rows.length === 0}
          empty={
            <div className="p-3">
              <EmptyState
                compact
                icon={<Icon name="file-text" size="md" />}
                title="No product sales"
                description="No product sales in this date range."
              />
            </div>
          }
        >
          <InteractiveTable
            bare
            columns={columns}
            rows={rows}
            rowKey={(r: any) => r.id}
            totalRow
            title="Product invoices"
          />
        </DataSection>
      </section>
    </div>
  );
};
