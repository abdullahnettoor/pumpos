import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useSales, useInvoices, queryKeys } from '../../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { CloudTransactionService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';
import { DataTable } from '../primitives/DataTable.js';
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { paperFromStation } from '../../services/reports/reportConfig.js';
import { letterheadFromStation } from '../../services/reports/letterhead.js';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile, Panel, Button, EmptyState, DateText } from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { FileText, Download } from 'lucide-react';

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
  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [busyId, setBusyId] = useState<string | null>(null);

  const canIssue = userRole !== 'Staff';
  const { data: sales, isLoading, error } = useSales({ stationId: selectedStation?.id, from: range.from, to: range.to });

  const rows = sales || [];
  const kpis = useMemo(() => {
    let total = 0;
    let invoiced = 0;
    for (const r of rows) {
      total += Number(r.totalAmount || 0);
      if (r.invoiceNumber) invoiced += 1;
    }
    return { total, invoiced, pending: rows.length - invoiced };
  }, [rows]);

  const exportInvoice = async (invoice: any) => {
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
    await exportReactPdf(element, `Invoice_${String(invoice.invoiceNumber || 'draft').replace(/[^a-z0-9]+/gi, '-')}`);
  };

  const handleInvoice = async (saleId: string) => {
    setBusyId(saleId);
    try {
      // Idempotent: issues a new invoice or returns the existing one.
      const invoice = await txService.issueInvoice(saleId);
      await exportInvoice(invoice);
      qc.invalidateQueries({ queryKey: queryKeys.sales(selectedStation?.id ?? '', range.from, range.to) });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate invoice.');
    } finally {
      setBusyId(null);
    }
  };

  const columns = useMemo<ColumnDef<any, any>[]>(() => [
    { accessorKey: 'businessDate', header: 'Date', cell: ({ getValue }) => <DateText value={getValue() as string} tone="muted" /> },
    { accessorKey: 'customerName', header: 'Customer', cell: ({ getValue }) => (getValue() ? <span style={{ color: 'var(--text-strong)' }}>{getValue() as string}</span> : <span style={{ color: 'var(--text-faint)' }}>Walk-in</span>) },
    { id: 'sale', header: 'Sale', cell: ({ row }) => <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.original.documentNumber || row.original.saleType}</span> },
    { accessorKey: 'totalAmount', header: 'Amount', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(getValue())}</span> },
    { accessorKey: 'invoiceNumber', header: 'Invoice', cell: ({ getValue }) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: getValue() ? 'var(--state-success-fg)' : 'var(--text-faint)' }}>{(getValue() as string) || '—'}</span> },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Button variant="secondary" size="xs" leftIcon={r.invoiceNumber ? <Download /> : <FileText />} loading={busyId === r.id} disabled={busyId === r.id || (!canIssue && !r.invoiceNumber)} onClick={() => handleInvoice(r.id)}>
            {r.invoiceNumber ? 'PDF' : 'Issue'}
          </Button>
        );
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busyId, canIssue, range.from, range.to]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        note="Non-fuel sales only — fuel is VAT (outside GST). Issuing assigns a gapless GST invoice number and downloads the PDF."
      />

      <KpiStrip columns="auto">
        <KpiTile dot="brand" label="Merchandise Sales" value={inr(kpis.total)} />
        <KpiTile dot="success" valueTone="success" label="Invoiced" value={String(kpis.invoiced)} />
        <KpiTile dot={kpis.pending > 0 ? 'warning' : 'success'} valueTone={kpis.pending > 0 ? 'warning' : undefined} label="Not Invoiced" value={String(kpis.pending)} />
      </KpiStrip>

      <Panel flush title="Merchandise invoices">
        {isLoading ? (
          <div style={{ padding: '16px' }}><EmptyState compact icon={<FileText />} title="Loading…" description="Fetching merchandise sales." /></div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '12px' }}><EmptyState compact icon={<FileText />} title="No merchandise sales" description="No merchandise sales in this date range." /></div>
        ) : (
          <DataTable
            bare
            columns={columns}
            data={rows}
            error={error as Error | null}
            emptyMessage="No merchandise sales in this range."
            getRowId={(r: any) => r.id}
            initialSorting={[{ id: 'businessDate', desc: true }]}
          />
        )}
      </Panel>
    </div>
  );
};
