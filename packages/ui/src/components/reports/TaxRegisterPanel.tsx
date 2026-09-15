import React, { useMemo, useState } from 'react';
import { useSalesTaxRegister, useIncomeGstRegister } from '../../query/hooks.js';
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile, Panel, EmptyState, DateText } from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import { Percent } from 'lucide-react';

export interface TaxRegisterPanelProps {
  selectedStation: any | null;
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-default)' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' };

/**
 * Output-tax register (Phase T5). The day's/period's tax **collected**, split by
 * the regime it belongs to:
 *  - **GST** on merchandise/lubes and on other income — creditable to the buyer.
 *  - **VAT** on fuel — outside GST, no input credit, so it is reported on its own
 *    line and never folded into the GST totals.
 * Every figure is read from the split frozen on the source row at capture, so a
 * later rate change can never restate a closed period.
 */
export const TaxRegisterPanel: React.FC<TaxRegisterPanelProps> = ({ selectedStation }) => {
  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const stationId = selectedStation?.id ?? null;

  const salesQ = useSalesTaxRegister({ stationId, from: range.from, to: range.to });
  const incomeQ = useIncomeGstRegister({ stationId, from: range.from, to: range.to });

  const saleRows = salesQ.data ?? [];
  const incomeRows = incomeQ.data ?? [];

  const totals = useMemo(() => {
    const gst = { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    const vat = { taxable: 0, vat: 0 };
    for (const r of saleRows) {
      if (r.taxCategory === 'FUEL_VAT') {
        vat.taxable += Number(r.taxableAmount || 0);
        vat.vat += Number(r.vat || 0);
      } else if (r.taxCategory === 'GST') {
        gst.taxable += Number(r.taxableAmount || 0);
        gst.cgst += Number(r.cgst || 0);
        gst.sgst += Number(r.sgst || 0);
        gst.igst += Number(r.igst || 0);
        gst.cess += Number(r.cess || 0);
      }
    }
    const incomeGst = incomeRows.reduce(
      (acc, r) => ({
        taxable: acc.taxable + Number(r.taxableAmount || 0),
        cgst: acc.cgst + Number(r.cgst || 0),
        sgst: acc.sgst + Number(r.sgst || 0),
        igst: acc.igst + Number(r.igst || 0),
        cess: acc.cess + Number(r.cess || 0),
      }),
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
    );
    const gstOutput = gst.cgst + gst.sgst + gst.igst + gst.cess;
    const incomeOutput = incomeGst.cgst + incomeGst.sgst + incomeGst.igst + incomeGst.cess;
    return { gst, vat, incomeGst, gstOutput, incomeOutput, totalGst: gstOutput + incomeOutput };
  }, [saleRows, incomeRows]);

  const loading = salesQ.isLoading || incomeQ.isLoading;
  const gstSaleRows = saleRows.filter((r: any) => r.taxCategory === 'GST');
  const vatSaleRows = saleRows.filter((r: any) => r.taxCategory === 'FUEL_VAT');

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view the tax register.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        note="Output tax collected. Fuel VAT is outside GST and is reported separately."
      />

      <KpiStrip columns="auto">
        <KpiTile
          dot="brand"
          valueTone="brand"
          label="Output GST"
          value={inr(totals.totalGst)}
          hint="merchandise + income"
        />
        <KpiTile
          label="— on Merchandise"
          value={inr(totals.gstOutput)}
          hint={`${gstSaleRows.length} lines`}
        />
        <KpiTile
          label="— on Other Income"
          value={inr(totals.incomeOutput)}
          hint={`${incomeRows.length} entries`}
        />
        <KpiTile
          dot="warning"
          label="Output VAT (Fuel)"
          value={inr(totals.vat.vat)}
          hint="no input credit"
        />
      </KpiStrip>

      {loading ? (
        <Panel flush title="Tax register">
          <div style={{ padding: '16px' }}>
            <LoadingSpinner text="Loading tax register…" />
          </div>
        </Panel>
      ) : (
        <>
          <Panel flush title="GST on merchandise sales">
            {gstSaleRows.length === 0 ? (
              <div style={{ padding: '12px' }}>
                <EmptyState
                  compact
                  icon={<Percent />}
                  title="No GST sales in this period"
                  description="Merchandise lines appear here once their product carries a GST rate."
                />
              </div>
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '12px',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderBottom: '1px solid var(--border-soft)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <th style={{ ...th, whiteSpace: 'nowrap' }}>Date</th>
                      <th style={th}>Document</th>
                      <th style={th}>Product</th>
                      <th style={th}>Buyer</th>
                      <th style={thR}>Rate</th>
                      <th style={thR}>Taxable</th>
                      <th style={thR}>CGST</th>
                      <th style={thR}>SGST</th>
                      <th style={thR}>IGST</th>
                      <th style={thR}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstSaleRows.map((r: any) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <DateText value={r.businessDate} variant="compact" tone="muted" />
                        </td>
                        <td style={td}>{r.documentNumber || '—'}</td>
                        <td style={{ ...td, color: 'var(--text-strong)', fontWeight: 600 }}>
                          {r.productName}
                          {r.hsnCode && (
                            <div
                              style={{
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 400,
                              }}
                            >
                              HSN {r.hsnCode}
                            </div>
                          )}
                        </td>
                        <td style={td}>{r.customerName}</td>
                        <td style={{ ...tdR, color: 'var(--text-muted)' }}>
                          {Number(r.gstRate || 0)}%{r.interState ? ' · IGST' : ''}
                        </td>
                        <td style={tdR}>{inr(Number(r.taxableAmount || 0))}</td>
                        <td style={tdR}>{inr(Number(r.cgst || 0))}</td>
                        <td style={tdR}>{inr(Number(r.sgst || 0))}</td>
                        <td style={tdR}>{inr(Number(r.igst || 0))}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: 'var(--text-strong)' }}>
                          {inr(Number(r.lineTotal || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        fontWeight: 700,
                        color: 'var(--text-strong)',
                      }}
                    >
                      <td style={td} colSpan={5}>
                        Total
                      </td>
                      <td style={tdR}>{inr(totals.gst.taxable)}</td>
                      <td style={tdR}>{inr(totals.gst.cgst)}</td>
                      <td style={tdR}>{inr(totals.gst.sgst)}</td>
                      <td style={tdR}>{inr(totals.gst.igst)}</td>
                      <td style={tdR}>{inr(totals.gst.taxable + totals.gstOutput)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Panel>

          <Panel flush title="VAT on fuel sales">
            {vatSaleRows.length === 0 ? (
              <div style={{ padding: '12px' }}>
                <EmptyState
                  compact
                  icon={<Percent />}
                  title="No VAT fuel lines in this period"
                  description="Fuel lines appear here once the product carries a VAT rate."
                />
              </div>
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '12px',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderBottom: '1px solid var(--border-soft)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <th style={{ ...th, whiteSpace: 'nowrap' }}>Date</th>
                      <th style={th}>Document</th>
                      <th style={th}>Product</th>
                      <th style={thR}>Qty</th>
                      <th style={thR}>Rate</th>
                      <th style={thR}>Taxable</th>
                      <th style={thR}>VAT</th>
                      <th style={thR}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vatSaleRows.map((r: any) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <DateText value={r.businessDate} variant="compact" tone="muted" />
                        </td>
                        <td style={td}>{r.documentNumber || '—'}</td>
                        <td style={{ ...td, color: 'var(--text-strong)', fontWeight: 600 }}>
                          {r.productName}
                        </td>
                        <td style={tdR}>{Number(r.quantity || 0)}</td>
                        <td style={{ ...tdR, color: 'var(--text-muted)' }}>
                          {Number(r.vatRate || 0)}%
                        </td>
                        <td style={tdR}>{inr(Number(r.taxableAmount || 0))}</td>
                        <td style={tdR}>{inr(Number(r.vat || 0))}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: 'var(--text-strong)' }}>
                          {inr(Number(r.lineTotal || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        fontWeight: 700,
                        color: 'var(--text-strong)',
                      }}
                    >
                      <td style={td} colSpan={5}>
                        Total
                      </td>
                      <td style={tdR}>{inr(totals.vat.taxable)}</td>
                      <td style={tdR}>{inr(totals.vat.vat)}</td>
                      <td style={tdR}>{inr(totals.vat.taxable + totals.vat.vat)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};
