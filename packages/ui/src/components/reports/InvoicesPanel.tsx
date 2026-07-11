import React, { useMemo, useState } from 'react';
import { useSales, useInvoices, queryKeys } from '../../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { CloudTransactionService } from '../../services/cloud.js';
import { useToast } from '../primitives/ToastProvider.js';
import { KpiCard } from '../primitives/KpiCard.js';
import { DateRangeField, computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { paperFromStation } from '../../services/reports/reportConfig.js';
import { letterheadFromStation } from '../../services/reports/letterhead.js';
import { inr } from '../../utils/format.js';
import { DateText } from '../../pump-ds/index.js';
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <DateRangeField value={range} onChange={setRange} clock={clock} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        <KpiCard label="Merchandise Sales" value={inr(kpis.total)} />
        <KpiCard label="Invoiced" value={kpis.invoiced} tone="success" />
        <KpiCard label="Not Invoiced" value={kpis.pending} tone={kpis.pending > 0 ? 'warning' : 'default'} />
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
        Non-fuel sales only — fuel is VAT (outside GST). Issuing assigns a gapless GST invoice number and downloads the PDF.
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-surface-alt)', textAlign: 'left' }}>
              {['Date', 'Customer', 'Sale', 'Amount', 'Invoice', ''].map((h, i) => (
                <th key={h} style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : error ? (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--state-danger-fg)' }}>Failed to load sales.</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No merchandise sales in this range.</td></tr>
            ) : (
              rows.map((r: any) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}><DateText value={r.businessDate} tone="muted" /></td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-strong)' }}>{r.customerName || <span style={{ color: 'var(--text-faint)' }}>Walk-in</span>}</td>
                  <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{r.documentNumber || r.saleType}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>{inr(r.totalAmount)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: r.invoiceNumber ? 'var(--state-success-fg)' : 'var(--text-faint)' }}>
                    {r.invoiceNumber || '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === r.id || (!canIssue && !r.invoiceNumber)}
                      onClick={() => handleInvoice(r.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      {r.invoiceNumber ? <Download size={13} /> : <FileText size={13} />}
                      {busyId === r.id ? '…' : r.invoiceNumber ? 'PDF' : 'Issue'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
