import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Truck } from 'lucide-react';
import type { DecantationReportVisit } from '@pump/shared';
import { Chip, DateText, EmptyState, Panel } from '../../../pump-ds/index.js';
import { formatQty } from '../../../utils/format.js';
import { muted, signedLitres, td, th, varianceColor } from './styles.js';

function transitText(v: DecantationReportVisit): string {
  const s = v.summary;
  return [
    s.shortChambers > 0 ? `${s.shortChambers} Short` : null,
    s.excessChambers > 0 ? `${s.excessChambers} Excess` : null,
    s.sealsBroken > 0 ? `${s.sealsBroken} Seal broken` : null,
    s.notEmptiedChambers > 0 ? `${s.notEmptiedChambers} Unemptied` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const InvoiceCell: React.FC<{ v: DecantationReportVisit }> = ({ v }) => {
  if (v.invoiceLinks.length === 0) return <span style={muted}>—</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {v.invoiceLinks.map((inv, idx) => (
        <div key={idx} style={{ fontSize: '11px' }}>
          {inv.status === 'NOT_LINKED' ? (
            <Chip size="xs" tone="neutral" variant="soft">
              Purchase not linked
            </Chip>
          ) : inv.status === 'PENDING_MEASUREMENT' ? (
            <Chip size="xs" tone="warning" variant="soft">
              Pending measurement
            </Chip>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500 }}>{inv.invoiceNumber || 'Linked Invoice'}:</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {formatQty(inv.receivedQty ?? 0, 2)} L received
              </span>
              <Chip
                size="xs"
                tone={
                  inv.status === 'SETTLING'
                    ? 'warning'
                    : inv.varianceType === 'SHORT'
                      ? 'danger'
                      : inv.varianceType === 'EXCESS'
                        ? 'success'
                        : 'neutral'
                }
                variant="soft"
              >
                {inv.status === 'SETTLING'
                  ? 'Settling'
                  : `${signedLitres(inv.varianceQty)} (${inv.statusLabel})`}
              </Chip>
              {inv.linkedVisitCount > 1 && (
                <span style={muted}>variance across {inv.linkedVisitCount} visits</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const DecantationVisitsTable: React.FC<{
  visits: DecantationReportVisit[];
  onSelect: (v: DecantationReportVisit) => void;
}> = ({ visits, onSelect }) => (
  <Panel flush title={`Tanker Unload Records (${visits.length})`}>
    {visits.length === 0 ? (
      <div style={{ padding: '24px' }}>
        <EmptyState
          compact
          icon={<Truck />}
          title="No decantation records found"
          description="There are no tanker visits recorded for this station within the selected date range."
        />
      </div>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
          data-testid="decantation-report-table"
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-subtle)',
              }}
            >
              <th style={th}>Date / Doc #</th>
              <th style={th}>Tanker / Driver</th>
              <th style={th}>Status</th>
              <th style={th}>Chamber Integrity (Transit)</th>
              <th style={th}>Tank Lines & Density Dev.</th>
              <th style={th}>Linked Invoice & Variance</th>
              <th style={{ ...th, width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => {
              const tone =
                v.status === 'MEASURED'
                  ? 'success'
                  : v.status === 'PENDING_MEASUREMENT'
                    ? 'warning'
                    : 'neutral';
              return (
                <tr
                  key={v.id}
                  style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                  className="hover:bg-subtle"
                  onClick={() => onSelect(v)}
                >
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>
                      <DateText value={v.date} />
                    </div>
                    <div style={muted}>{v.documentNumber}</div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{v.tankerNumber}</div>
                    {v.driverName && <div style={muted}>{v.driverName}</div>}
                  </td>
                  <td style={td}>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        alignItems: 'flex-start',
                      }}
                    >
                      <Chip size="xs" tone={tone} variant="soft">
                        {v.status}
                      </Chip>
                      {v.flags.length > 0 && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--state-danger-fg)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <AlertTriangle size={11} /> {v.flags.length} flag
                          {v.flags.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={td}>
                    {v.chambers.length === 0 ? (
                      <span style={muted}>No chambers recorded</span>
                    ) : v.chamberSummary.hasTransitDiscrepancy ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <Chip size="xs" tone="danger" variant="soft">
                          Transit Discrepancy
                        </Chip>
                        <span style={{ fontSize: '11px', color: 'var(--state-danger-fg)' }}>
                          {transitText(v)}
                        </span>
                      </div>
                    ) : (
                      <Chip size="xs" tone="neutral" variant="soft">
                        <CheckCircle2 size={10} style={{ marginRight: '3px' }} />
                        OK ({v.chamberSummary.totalChambers} ch.)
                      </Chip>
                    )}
                    {v.summary.settledInvoiceVarianceQty !== null && (
                      <div
                        style={{
                          ...muted,
                          marginTop: '3px',
                          color: varianceColor(v.summary.settledInvoiceVarianceQty),
                        }}
                      >
                        Station: {signedLitres(v.summary.settledInvoiceVarianceQty)}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    {v.tankLines.length === 0 ? (
                      <span style={muted}>No lines</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {v.tankLines.map((l) => (
                          <div key={l.id} style={{ fontSize: '11px' }}>
                            <span style={{ fontWeight: 600 }}>{l.tankName}</span> ({l.productCode}):{' '}
                            <span style={{ fontFamily: 'var(--font-mono)' }}>
                              {l.receivedQty !== null
                                ? `${formatQty(l.receivedQty, 2)} L`
                                : 'Pending dip'}
                            </span>
                            {l.roDensity !== null && (
                              <span style={{ color: 'var(--text-muted)' }}>
                                {' '}
                                · RO: {l.roDensity}
                                {l.densityDeviation !== null && (
                                  <span
                                    style={{
                                      color:
                                        Math.abs(l.densityDeviation) > 3
                                          ? 'var(--state-danger-fg)'
                                          : 'inherit',
                                    }}
                                  >
                                    {' '}
                                    ({l.densityDeviation > 0 ? '+' : ''}
                                    {l.densityDeviation})
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <InvoiceCell v={v} />
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </Panel>
);
