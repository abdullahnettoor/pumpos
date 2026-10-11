import React from 'react';
import type { DecantationReport } from '@pump/shared';
import { KpiStrip, KpiTile, Panel } from '../../../pump-ds/index.js';
import { formatQty } from '../../../utils/format.js';
import { litres, signedLitres, td, tdR, th, thR, varianceColor } from './styles.js';

/** KPI strip + per-product totals. All figures are server-composed. */
export const DecantationSummary: React.FC<{ report: DecantationReport }> = ({ report }) => {
  const t = report.totals;
  return (
    <>
      <KpiStrip columns="auto">
        <KpiTile
          dot="brand"
          label="Tanker Visits"
          value={String(t.totalVisits)}
          hint={`${t.measuredVisits} measured · ${t.pendingVisits} pending`}
        />
        <KpiTile
          dot="info"
          label="Volume Received"
          value={litres(t.totalReceivedQty)}
          hint={`${formatQty(t.pendingReceivedQty, 2)} L not yet settled`}
        />
        <KpiTile
          dot="neutral"
          label="Settled Invoice Volume"
          value={litres(t.totalInvoiceQty)}
          hint={`${formatQty(t.pendingInvoiceQty, 2)} L pending · ${t.settlingInvoiceCount} settling`}
        />
        <KpiTile
          dot={t.totalVarianceQty < 0 ? 'danger' : t.totalVarianceQty > 0 ? 'success' : 'neutral'}
          label="Settled Invoice Variance"
          value={signedLitres(t.totalVarianceQty)}
          hint={
            t.totalVarianceQty < 0
              ? 'station decantation loss'
              : t.totalVarianceQty > 0
                ? 'station decantation excess'
                : 'exact match'
          }
        />
        <KpiTile
          dot={t.transitDiscrepancies > 0 ? 'danger' : 'neutral'}
          label="Transit Discrepancies"
          value={String(t.transitDiscrepancies)}
          hint={`${t.totalChambersShort} short · ${t.totalChambersExcess} excess · ${t.totalSealsBroken} broken seals · ${t.totalChambersNotEmptied} unemptied`}
        />
      </KpiStrip>

      {report.productTotals.length > 0 && (
        <Panel title="Totals by Product">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th style={th}>Product</th>
                  <th style={thR}>Received (settled)</th>
                  <th style={thR}>Invoiced (settled)</th>
                  <th style={thR}>Net Variance</th>
                  <th style={thR}>Short (Loss)</th>
                  <th style={thR}>Excess</th>
                  <th style={thR}>Pending</th>
                  <th style={thR}>Visits / Lines</th>
                </tr>
              </thead>
              <tbody>
                {report.productTotals.map((p) => (
                  <tr key={p.productId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={td}>
                      <span style={{ fontWeight: 600 }}>{p.productName}</span>{' '}
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        ({p.productCode})
                      </span>
                    </td>
                    <td style={tdR}>{litres(p.settledReceivedQty)}</td>
                    <td style={tdR}>{litres(p.totalInvoiceQty)}</td>
                    <td
                      style={{
                        ...tdR,
                        fontWeight: 600,
                        color: varianceColor(p.totalVarianceQty),
                      }}
                    >
                      {signedLitres(p.totalVarianceQty)}
                    </td>
                    <td style={{ ...tdR, color: varianceColor(p.shortVarianceQty ? -1 : 0) }}>
                      {p.shortVarianceQty > 0 ? `-${formatQty(p.shortVarianceQty, 2)} L` : '—'}
                    </td>
                    <td style={{ ...tdR, color: varianceColor(p.excessVarianceQty ? 1 : 0) }}>
                      {p.excessVarianceQty > 0 ? `+${formatQty(p.excessVarianceQty, 2)} L` : '—'}
                    </td>
                    <td style={tdR}>
                      {p.pendingReceivedQty > 0 || p.pendingInvoiceQty > 0
                        ? `${formatQty(p.pendingReceivedQty, 2)} L rec. / ${formatQty(p.pendingInvoiceQty, 2)} L inv.`
                        : '—'}
                    </td>
                    <td style={tdR}>
                      {p.visitCount} visits · {p.measuredLineCount} measured
                      {p.pendingLineCount > 0 ? `, ${p.pendingLineCount} pend.` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
};
