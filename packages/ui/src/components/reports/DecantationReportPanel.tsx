import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Printer, Truck, XCircle } from 'lucide-react';
import type { DecantationReport, DecantationReportVisit } from '@pump/shared';
import { useDecantationReport } from '../../query/hooks.js';
import { computeRange } from '../primitives/DateRangeField.js';
import type { DateRange } from '../primitives/DateRangeField.js';
import { Drawer } from '../Drawer.js';
import { formatDateTime, formatQty } from '../../utils/format.js';
import {
  Button,
  Chip,
  DateText,
  EmptyState,
  KpiStrip,
  KpiTile,
  Panel,
} from '../../pump-ds/index.js';
import { ReportRangeBar } from './ReportRangeBar.js';
import { LoadingSpinner } from '../LoadingSpinner.js';

export interface DecantationReportPanelProps {
  selectedStation: {
    id: string;
    name?: string;
    settings?: Record<string, unknown>;
  } | null;
}

const th: React.CSSProperties = {
  padding: '8px 10px',
  fontWeight: 600,
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
};
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = {
  padding: '10px 10px',
  color: 'var(--text-default)',
  fontSize: '12px',
  borderBottom: '1px solid var(--border-subtle)',
};
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' };

export const DecantationReportPanel: React.FC<DecantationReportPanelProps> = ({
  selectedStation,
}) => {
  const stationId = selectedStation?.id ?? null;
  const s = (selectedStation?.settings ?? {}) as Record<string, unknown>;
  const clock = useMemo(
    () => ({
      timeZone: s.timezone as string | undefined,
      dayStartsAt: s.business_day_starts_at as string | undefined,
    }),
    [s.timezone, s.business_day_starts_at],
  );

  const defaultRange = useMemo<DateRange>(() => {
    return computeRange('last-30', clock);
  }, [clock]);

  const [range, setRange] = useState<DateRange>(defaultRange);
  const [activeVisit, setActiveVisit] = useState<DecantationReportVisit | null>(null);

  const reportQ = useDecantationReport(
    {
      stationId: stationId ?? undefined,
      from: range.from,
      to: range.to,
    },
    { enabled: !!stationId },
  );

  const report: DecantationReport | undefined = reportQ.data;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReportRangeBar
        value={range}
        onChange={setRange}
        clock={clock}
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Printer size={13} />}
            onClick={handlePrint}
            disabled={!report || report.visits.length === 0}
          >
            Print
          </Button>
        }
        note="Decantation Report: rows per tanker visit with tank line dips, invoice reconciliation and chamber integrity. Distinguishes transit loss (chamber shortages, broken seals, unemptied compartments) from station underground decantation loss."
      />

      {reportQ.isLoading && (
        <div style={{ padding: '48px', display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner />
        </div>
      )}

      {reportQ.error && (
        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--state-danger-bg)',
            color: 'var(--state-danger-fg)',
            borderRadius: 'var(--radius-input)',
            fontSize: '13px',
          }}
        >
          {reportQ.error instanceof Error
            ? reportQ.error.message
            : 'Failed to load Decantation Report'}
        </div>
      )}

      {report && (
        <>
          {/* KPI Strip */}
          <KpiStrip columns="auto">
            <KpiTile
              dot="brand"
              label="Tanker Visits"
              value={String(report.totals.totalVisits)}
              hint={`${report.totals.measuredVisits} measured · ${report.totals.pendingVisits} pending`}
            />
            <KpiTile
              dot="info"
              label="Volume Received"
              value={`${formatQty(report.totals.totalReceivedQty, 2)} L`}
              hint="station underground dips"
            />
            <KpiTile
              dot="neutral"
              label="Volume Invoiced"
              value={`${formatQty(report.totals.totalInvoiceQty, 2)} L`}
              hint="linked fuel purchases"
            />
            <KpiTile
              dot={
                report.totals.totalVarianceQty < 0
                  ? 'danger'
                  : report.totals.totalVarianceQty > 0
                    ? 'success'
                    : 'neutral'
              }
              label="Net Dip Variance"
              value={`${report.totals.totalVarianceQty > 0 ? '+' : ''}${formatQty(report.totals.totalVarianceQty, 2)} L`}
              hint={
                report.totals.totalVarianceQty < 0
                  ? 'station decantation loss'
                  : report.totals.totalVarianceQty > 0
                    ? 'station decantation excess'
                    : 'exact match'
              }
            />
            <KpiTile
              dot={
                report.totals.totalChambersShort > 0 ||
                report.totals.totalChambersNotEmptied > 0 ||
                report.totals.totalSealsBroken > 0
                  ? 'danger'
                  : 'neutral'
              }
              label="Transit Discrepancies"
              value={String(
                report.totals.totalChambersShort +
                  report.totals.totalChambersNotEmptied +
                  report.totals.totalSealsBroken,
              )}
              hint={`${report.totals.totalChambersShort} short · ${report.totals.totalSealsBroken} broken seals · ${report.totals.totalChambersNotEmptied} unemptied`}
            />
          </KpiStrip>

          {/* Product Totals Summary */}
          {report.productTotals.length > 0 && (
            <Panel title="Totals by Product">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                      <th style={th}>Product</th>
                      <th style={thR}>Received Volume</th>
                      <th style={thR}>Invoiced Volume</th>
                      <th style={thR}>Net Variance</th>
                      <th style={thR}>Short (Loss)</th>
                      <th style={thR}>Excess</th>
                      <th style={thR}>Visits / Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.productTotals.map((p) => (
                      <tr
                        key={p.productId}
                        style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      >
                        <td style={td}>
                          <span style={{ fontWeight: 600 }}>{p.productName}</span>{' '}
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                            ({p.productCode})
                          </span>
                        </td>
                        <td style={tdR}>{formatQty(p.totalReceivedQty, 2)} L</td>
                        <td style={tdR}>{formatQty(p.totalInvoiceQty, 2)} L</td>
                        <td
                          style={{
                            ...tdR,
                            fontWeight: 600,
                            color:
                              p.totalVarianceQty < 0
                                ? 'var(--state-danger-fg)'
                                : p.totalVarianceQty > 0
                                  ? 'var(--state-success-fg)'
                                  : 'var(--text-muted)',
                          }}
                        >
                          {p.totalVarianceQty > 0 ? '+' : ''}
                          {formatQty(p.totalVarianceQty, 2)} L
                        </td>
                        <td
                          style={{
                            ...tdR,
                            color:
                              p.shortVarianceQty > 0
                                ? 'var(--state-danger-fg)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {p.shortVarianceQty > 0 ? `-${formatQty(p.shortVarianceQty, 2)} L` : '—'}
                        </td>
                        <td
                          style={{
                            ...tdR,
                            color:
                              p.excessVarianceQty > 0
                                ? 'var(--state-success-fg)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {p.excessVarianceQty > 0
                            ? `+${formatQty(p.excessVarianceQty, 2)} L`
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

          {/* Visits Table */}
          <Panel flush title={`Tanker Unload Records (${report.visits.length})`}>
            {report.visits.length === 0 ? (
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
                    {report.visits.map((v) => {
                      const isPending = v.status === 'PENDING_MEASUREMENT';
                      const isMeasured = v.status === 'MEASURED';

                      return (
                        <tr
                          key={v.id}
                          style={{
                            cursor: 'pointer',
                            transition: 'background-color 0.15s',
                          }}
                          className="hover:bg-subtle"
                          onClick={() => setActiveVisit(v)}
                        >
                          {/* Date / Doc # */}
                          <td style={td}>
                            <div style={{ fontWeight: 600 }}>
                              <DateText value={v.date} />
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {v.documentNumber}
                            </div>
                          </td>

                          {/* Tanker / Driver */}
                          <td style={td}>
                            <div style={{ fontWeight: 600 }}>{v.tankerNumber}</div>
                            {v.driverName && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {v.driverName}
                              </div>
                            )}
                          </td>

                          {/* Status & Flags */}
                          <td style={td}>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                alignItems: 'flex-start',
                              }}
                            >
                              <Chip
                                size="xs"
                                tone={isMeasured ? 'success' : isPending ? 'warning' : 'neutral'}
                                variant="soft"
                              >
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

                          {/* Chamber Integrity (Transit Loss) */}
                          <td style={td}>
                            {v.chambers.length === 0 ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                No chambers recorded
                              </span>
                            ) : v.chamberSummary.hasTransitDiscrepancy ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <Chip size="xs" tone="danger" variant="soft">
                                  Transit Discrepancy
                                </Chip>
                                <span style={{ fontSize: '11px', color: 'var(--state-danger-fg)' }}>
                                  {[
                                    v.chamberSummary.shortCount > 0
                                      ? `${v.chamberSummary.shortCount} Short`
                                      : null,
                                    v.chamberSummary.excessCount > 0
                                      ? `${v.chamberSummary.excessCount} Excess`
                                      : null,
                                    v.chamberSummary.sealsBrokenCount > 0
                                      ? `${v.chamberSummary.sealsBrokenCount} Seal broken`
                                      : null,
                                    v.chamberSummary.notEmptiedCount > 0
                                      ? `${v.chamberSummary.notEmptiedCount} Unemptied`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Chip size="xs" tone="neutral" variant="soft">
                                  <CheckCircle2 size={10} style={{ marginRight: '3px' }} />
                                  OK ({v.chamberSummary.totalChambers} ch.)
                                </Chip>
                              </div>
                            )}
                          </td>

                          {/* Tank Lines */}
                          <td style={td}>
                            {v.tankLines.length === 0 ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                No lines
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {v.tankLines.map((l) => (
                                  <div key={l.id} style={{ fontSize: '11px' }}>
                                    <span style={{ fontWeight: 600 }}>{l.tankName}</span> (
                                    {l.productCode}):{' '}
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

                          {/* Linked Invoice & Variance */}
                          <td style={td}>
                            {v.invoiceLinks.length === 0 ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                —
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {v.invoiceLinks.map((inv, idx) => {
                                  const isShort = inv.varianceType === 'SHORT';
                                  const isExcess = inv.varianceType === 'EXCESS';

                                  return (
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
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                          }}
                                        >
                                          <span style={{ fontWeight: 500 }}>
                                            {inv.invoiceNumber || 'Linked Invoice'}:
                                          </span>
                                          <Chip
                                            size="xs"
                                            tone={
                                              isShort ? 'danger' : isExcess ? 'success' : 'neutral'
                                            }
                                            variant="soft"
                                          >
                                            {inv.varianceQty !== null
                                              ? `${inv.varianceQty > 0 ? '+' : ''}${formatQty(inv.varianceQty, 2)} L (${inv.statusLabel})`
                                              : inv.statusLabel}
                                          </Chip>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>

                          {/* Chevron */}
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
        </>
      )}

      {/* Drawer Details for a selected Tanker Visit */}
      {activeVisit && (
        <Drawer
          isOpen={!!activeVisit}
          onClose={() => setActiveVisit(null)}
          title={`Tanker Visit: ${activeVisit.tankerNumber}`}
          widthVariant="wide"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>
            {/* Header info */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-panel)',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Business Date</div>
                <div style={{ fontWeight: 600 }}>{activeVisit.date}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Document Number</div>
                <div style={{ fontWeight: 600 }}>{activeVisit.documentNumber}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Driver</div>
                <div style={{ fontWeight: 600 }}>{activeVisit.driverName || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Status</div>
                <Chip
                  size="xs"
                  tone={
                    activeVisit.status === 'MEASURED'
                      ? 'success'
                      : activeVisit.status === 'PENDING_MEASUREMENT'
                        ? 'warning'
                        : 'neutral'
                  }
                  variant="soft"
                >
                  {activeVisit.status}
                </Chip>
              </div>
              {activeVisit.unloadStartedAt && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unload Time</div>
                  <div style={{ fontSize: '12px' }}>
                    {formatDateTime(activeVisit.unloadStartedAt)}
                    {activeVisit.unloadEndedAt
                      ? ` - ${formatDateTime(activeVisit.unloadEndedAt)}`
                      : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Flags */}
            {activeVisit.flags.length > 0 && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--state-danger-bg)',
                  color: 'var(--state-danger-fg)',
                  borderRadius: 'var(--radius-input)',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} /> Attention Flags
                </div>
                {activeVisit.flags.map((f, i) => (
                  <div key={i}>
                    • <strong>{f.code}</strong>: {f.message}
                  </div>
                ))}
              </div>
            )}

            {/* Chamber Inspection (Transit Loss) */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
                  Chamber Inspection (Transit Integrity)
                </h4>
                {activeVisit.chamberSummary.hasTransitDiscrepancy ? (
                  <Chip size="xs" tone="danger" variant="soft">
                    Transit Discrepancy Found
                  </Chip>
                ) : (
                  <Chip size="xs" tone="success" variant="soft">
                    Seals & Dips OK
                  </Chip>
                )}
              </div>

              {activeVisit.chambers.length === 0 ? (
                <div
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    padding: '12px',
                    border: '1px dashed var(--border-default)',
                    borderRadius: 'var(--radius-input)',
                  }}
                >
                  No chamber check details recorded for this visit.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        backgroundColor: 'var(--bg-subtle)',
                      }}
                    >
                      <th style={th}>Chamber #</th>
                      <th style={thR}>Capacity (L)</th>
                      <th style={thR}>Dip (mm)</th>
                      <th style={th}>Mark</th>
                      <th style={th}>Seal</th>
                      <th style={th}>Emptied</th>
                      <th style={th}>Target Tank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeVisit.chambers.map((ch) => (
                      <tr key={ch.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={td}>Chamber {ch.chamberNo}</td>
                        <td style={tdR}>
                          {ch.capacityL !== null ? `${formatQty(ch.capacityL, 2)}` : '—'}
                        </td>
                        <td style={tdR}>{ch.dipMm !== null ? `${ch.dipMm}` : '—'}</td>
                        <td style={td}>
                          <Chip
                            size="xs"
                            tone={
                              ch.mark === 'SHORT'
                                ? 'danger'
                                : ch.mark === 'EXCESS'
                                  ? 'info'
                                  : 'neutral'
                            }
                            variant="soft"
                          >
                            {ch.mark || 'OK'}
                          </Chip>
                        </td>
                        <td style={td}>
                          {ch.sealOk === false ? (
                            <Chip size="xs" tone="danger" variant="soft">
                              <XCircle size={10} style={{ marginRight: '3px' }} /> Broken
                            </Chip>
                          ) : (
                            <Chip size="xs" tone="neutral" variant="soft">
                              <CheckCircle2 size={10} style={{ marginRight: '3px' }} /> Intact
                            </Chip>
                          )}
                        </td>
                        <td style={td}>
                          {ch.emptied === false ? (
                            <Chip size="xs" tone="danger" variant="soft">
                              Not Emptied
                            </Chip>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Yes
                            </span>
                          )}
                        </td>
                        <td style={td}>{ch.tankName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Tank Lines (Station Decantation Dip) */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>
                Underground Tank Dips & Decantation
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-default)',
                      backgroundColor: 'var(--bg-subtle)',
                    }}
                  >
                    <th style={th}>Tank / Product</th>
                    <th style={thR}>Before Dip</th>
                    <th style={thR}>After Dip</th>
                    <th style={thR}>Sales During</th>
                    <th style={thR}>Received Volume</th>
                    <th style={thR}>RO Density</th>
                    <th style={thR}>Inv. Density</th>
                    <th style={thR}>Deviation</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVisit.tankLines.map((line) => (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{line.tankName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {line.productName}
                        </div>
                      </td>
                      <td style={tdR}>{line.beforeDip} mm</td>
                      <td style={tdR}>{line.afterDip !== null ? `${line.afterDip} mm` : '—'}</td>
                      <td style={tdR}>{formatQty(line.salesDuring, 2)} L</td>
                      <td style={{ ...tdR, fontWeight: 600 }}>
                        {line.receivedQty !== null
                          ? `${formatQty(line.receivedQty, 2)} L`
                          : 'Pending'}
                      </td>
                      <td style={tdR}>{line.roDensity !== null ? `${line.roDensity}` : '—'}</td>
                      <td style={tdR}>
                        {line.invoiceDensity !== null ? `${line.invoiceDensity}` : '—'}
                      </td>
                      <td
                        style={{
                          ...tdR,
                          fontWeight: line.densityDeviation !== null ? 600 : 'normal',
                          color:
                            line.densityDeviation !== null && Math.abs(line.densityDeviation) > 3
                              ? 'var(--state-danger-fg)'
                              : 'inherit',
                        }}
                      >
                        {line.densityDeviation !== null
                          ? `${line.densityDeviation > 0 ? '+' : ''}${line.densityDeviation}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Linked Invoice & Variance */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600 }}>
                Invoice Reconciliation & Station Loss / Excess
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-default)',
                      backgroundColor: 'var(--bg-subtle)',
                    }}
                  >
                    <th style={th}>Product</th>
                    <th style={th}>Invoice Number</th>
                    <th style={thR}>Invoice Qty</th>
                    <th style={thR}>Received Qty</th>
                    <th style={thR}>Variance</th>
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeVisit.invoiceLinks.map((inv, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={td}>
                        <span style={{ fontWeight: 600 }}>{inv.productName}</span>{' '}
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          ({inv.productCode})
                        </span>
                      </td>
                      <td style={td}>{inv.invoiceNumber || '—'}</td>
                      <td style={tdR}>
                        {inv.invoiceQty !== null ? `${formatQty(inv.invoiceQty, 2)} L` : '—'}
                      </td>
                      <td style={tdR}>
                        {inv.receivedQty !== null ? `${formatQty(inv.receivedQty, 2)} L` : '—'}
                      </td>
                      <td
                        style={{
                          ...tdR,
                          fontWeight: 600,
                          color:
                            inv.varianceQty !== null && inv.varianceQty < 0
                              ? 'var(--state-danger-fg)'
                              : inv.varianceQty !== null && inv.varianceQty > 0
                                ? 'var(--state-success-fg)'
                                : 'inherit',
                        }}
                      >
                        {inv.varianceQty !== null
                          ? `${inv.varianceQty > 0 ? '+' : ''}${formatQty(inv.varianceQty, 2)} L`
                          : '—'}
                      </td>
                      <td style={td}>
                        <Chip
                          size="xs"
                          tone={
                            inv.status === 'NOT_LINKED'
                              ? 'neutral'
                              : inv.status === 'PENDING_MEASUREMENT'
                                ? 'warning'
                                : inv.varianceType === 'SHORT'
                                  ? 'danger'
                                  : inv.varianceType === 'EXCESS'
                                    ? 'success'
                                    : 'neutral'
                          }
                          variant="soft"
                        >
                          {inv.statusLabel}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Notes */}
            {activeVisit.notes && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Operator Notes
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-input)',
                  }}
                >
                  {activeVisit.notes}
                </div>
              </div>
            )}
          </div>
        </Drawer>
      )}
    </div>
  );
};
