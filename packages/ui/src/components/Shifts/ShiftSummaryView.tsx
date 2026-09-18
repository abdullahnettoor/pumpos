import React, { useState, useRef } from 'react';
import { CloudShiftService } from '../../services/cloud.js';
import {
  DEFAULT_SHIFT_SUMMARY_CONFIG,
  paperFromStation,
} from '../../services/reports/reportConfig.js';
import { letterheadFromStation } from '../../services/reports/letterhead.js';
import { Button } from '../../pump-ds/index.js';
import { ArrowLeft, Printer, Download, Unlock, AlertTriangle } from 'lucide-react';
import { ShiftTransactionsPanel } from './ShiftTransactionsPanel.js';
import { useConfirm } from '../primitives/ConfirmDialog.js';
import { useToast } from '../primitives/ToastProvider.js';
import { inr } from '../../utils/format.js';
import { isDesktopApp } from '../../utils/platform.js';
import { formatStationDateTime } from '@pump/shared';
import { ShiftBusinessDateContext } from './ShiftBusinessDateContext.js';
import { useStationBusinessDate } from '../../hooks/useStationBusinessDate.js';

const shiftService = new CloudShiftService();

// Variance is a first-class business concept, so its presentation is defined
// once: short (negative) reads as an error, over (positive) as a caution, and
// only an exact match reads as settled.
const varianceColor = (variance: number): string =>
  variance < 0
    ? 'var(--brand-danger)'
    : variance > 0
      ? 'var(--brand-warning)'
      : 'var(--state-success-fg)';

interface ShiftSummaryViewProps {
  shiftSummary: any; // shiftSummaries record
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  canReopen: boolean;
  gracePeriodExpiresAt?: string | null;
  onReopenSuccess: () => void;
  onBack?: () => void;
  shiftStatus?: 'CLOSED' | 'LOCKED';
  onTransactionAdded?: () => void | Promise<unknown>;
  station?: any;
}

export const ShiftSummaryView: React.FC<ShiftSummaryViewProps> = ({
  shiftSummary,
  userRole,
  canReopen,
  gracePeriodExpiresAt,
  onReopenSuccess,
  onBack,
  shiftStatus = 'CLOSED',
  onTransactionAdded,
  station,
}) => {
  const [reopening, setReopening] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const { snapshotData, generatedAt } = shiftSummary;
  const stationSettings = (station?.settings ?? {}) as {
    timezone?: string;
    business_day_starts_at?: string;
  };
  const currentBusinessDate = useStationBusinessDate(
    stationSettings.timezone,
    stationSettings.business_day_starts_at,
  );
  const {
    shiftId,
    templateName,
    openedAt,
    closedAt,
    openedBy,
    closedBy,
    closedByName,
    openingCash,
    closingCash,
    cashNetChange,
    nozzleReadings = [],
    fuelByProduct = [],
    totalVolumeSold = 0,
    totalTestingVolume = 0,
    totalNetVolumeSold = 0,
    warnings = [],
    expectedCash = Number(openingCash),
    cashVariance = 0,
    cashCollectionsSum = 0,
    cashSalesSum = 0,
    cardCollectionsSum = 0,
    upiCollectionsSum = 0,
    bankCollectionsSum = 0,
    cashExpensesSum = 0,
    expenses = [],
    purchases = [],
    collections = [],
    handovers = [],
    terminalBreakdown = [],
    creditSales = [],
    creditSalesTotal = 0,
  } = snapshotData;

  // Fuel unit handling (L for liquids, kg for CNG/Auto-LPG). A tank/nozzle
  // inherits its unit from its product; we never sum across different units.
  const fuelUnits: string[] = Array.from(
    new Set((nozzleReadings as any[]).map((r) => r.unit || 'L')),
  );

  const nozzleNet = (r: any): number =>
    r.netVolume != null
      ? Number(r.netVolume)
      : Number(r.volumeSold || 0) - Number(r.testingVolume || 0);

  const handleReopen = async () => {
    if (
      !(await confirm({
        title: 'Reopen this shift?',
        message:
          'Reopening will delete this compiled Shift Summary and set the shift state back to OPEN. It is allowed until the Business Day closes, provided no other shift is open.',
        confirmLabel: 'Reopen',
        danger: true,
      }))
    ) {
      return;
    }
    try {
      setReopening(true);
      await shiftService.reopenShift(shiftId);
      toast.success('Shift reopened.');
      onReopenSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reopen shift');
    } finally {
      setReopening(false);
    }
  };

  return (
    <div
      ref={printRef}
      className="card card-comfortable print-area"
      style={{ maxWidth: '800px', margin: '0 auto' }}
    >
      {/* Header controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-soft)',
          paddingBottom: '16px',
        }}
        className="no-print"
      >
        <Button variant="secondary" size="sm" leftIcon={<ArrowLeft size={13} />} onClick={onBack}>
          Back to Workspace
        </Button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download size={13} />}
            onClick={async () => {
              const [{ exportReactPdf }, doc] = await Promise.all([
                import('../../services/exportPdf.js'),
                import('../../services/reports/shiftSummaryDoc.js'),
              ]);
              const sections = station?.settings?.report_config?.shiftSummary?.length
                ? station.settings.report_config.shiftSummary
                : DEFAULT_SHIFT_SUMMARY_CONFIG.sections;
              const config = {
                ...DEFAULT_SHIFT_SUMMARY_CONFIG,
                sections: sections,
                showLogo: station?.settings?.report_config?.showLogo !== false,
                stationName: station?.name || templateName,
                letterhead: letterheadFromStation(station),
                paper: paperFromStation(station),
              };
              await exportReactPdf(
                React.createElement(doc.ShiftSummaryDoc, { snapshot: snapshotData, config }),
                `Shift_Summary_${String(shiftId).slice(0, 8)}`,
              );
            }}
          >
            Save PDF
          </Button>
          {/* window.print() is a no-op in the Tauri webview — desktop uses Save PDF. */}
          {!isDesktopApp() && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Printer size={13} />}
              onClick={() => window.print()}
            >
              Print Shift Summary
            </Button>
          )}

          {canReopen && (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Unlock size={13} />}
              onClick={handleReopen}
              loading={reopening}
            >
              {reopening ? 'Reopening…' : 'Reopen Shift'}
            </Button>
          )}
        </div>
      </div>

      {/* Audit Header Banner */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-strong)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Shift Summary Record
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
          Authoritative Operational Snapshot • Compiled{' '}
          {formatStationDateTime(generatedAt, stationSettings.timezone)}
        </p>
      </div>

      {shiftSummary.businessDate && (
        <div style={{ marginBottom: '20px' }}>
          <ShiftBusinessDateContext
            businessDate={shiftSummary.businessDate}
            currentBusinessDate={currentBusinessDate}
            openedAt={openedAt || shiftSummary.openedAt}
            closedAt={closedAt || shiftSummary.closedAt}
            timeZone={stationSettings.timezone}
          />
        </div>
      )}

      {/* Metadata Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          padding: '20px',
          backgroundColor: 'var(--bg-surface-alt)',
          borderRadius: 'var(--radius-input)',
          marginBottom: '28px',
          border: '1px solid var(--border-soft)',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'block',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Shift ID
          </span>
          <strong
            style={{
              fontSize: '13px',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {shiftId.slice(0, 8)}...
          </strong>
        </div>
        <div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'block',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Shift Template
          </span>
          <strong style={{ fontSize: '13px', color: 'var(--text-strong)' }}>{templateName}</strong>
        </div>
        <div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'block',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Lifecycle Timestamps
          </span>
          <strong style={{ fontSize: '12px', color: 'var(--text-strong)' }}>
            Opened{' '}
            {formatStationDateTime(openedAt || shiftSummary.openedAt, stationSettings.timezone)}
            <br />
            Closed{' '}
            {formatStationDateTime(closedAt || shiftSummary.closedAt, stationSettings.timezone)}
          </strong>
        </div>
        <div>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'block',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Reconciled By
          </span>
          <strong style={{ fontSize: '13px', color: 'var(--text-strong)' }}>{closedByName}</strong>
        </div>
      </div>

      {/* Warnings Panel */}
      {warnings && warnings.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--state-warning-bg)',
            color: 'var(--state-warning-fg)',
            padding: '16px',
            borderRadius: 'var(--radius-input)',
            marginBottom: '28px',
            fontSize: '12px',
            border: '1px solid var(--border-soft)',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '6px' }}>
            <AlertTriangle
              size={14}
              style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }}
            />{' '}
            Warnings Captured at Close Time:
          </strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {warnings.map((warn: string, idx: number) => (
              <li key={idx} style={{ marginTop: '4px' }}>
                {warn}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Nozzle Readings Table */}
      <h3
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-strong)',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}
      >
        Nozzle Reconciliation & Volume Sold
      </h3>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: '32px',
          fontSize: '13px',
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: 'var(--bg-surface-alt)',
              borderBottom: '1px solid var(--border-soft)',
              textAlign: 'left',
              color: 'var(--text-muted)',
            }}
          >
            <th style={{ padding: '10px 16px', fontWeight: 600 }}>Nozzle</th>
            <th style={{ padding: '10px 16px', fontWeight: 600 }}>Product</th>
            <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
              Opening Rd
            </th>
            <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
              Closing Rd
            </th>
            <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Gross Vol</th>
            <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Testing</th>
            <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Net Sold</th>
          </tr>
        </thead>
        <tbody>
          {nozzleReadings.map((nr: any, idx: number) => {
            const gross = Number(nr.volumeSold ?? 0);
            const testing = Number(nr.testingVolume ?? 0);
            const net = nr.netVolume != null ? Number(nr.netVolume) : gross - testing;
            return (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}>
                  {nr.nozzleName}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-default)' }}>
                  {nr.productName} ({nr.productCode})
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {Number(nr.openingReading).toFixed(3)}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {Number(nr.closingReading).toFixed(3)}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {gross.toFixed(3)}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    color: testing > 0 ? 'var(--color-warning, #b45309)' : 'var(--text-muted)',
                  }}
                >
                  {testing.toFixed(3)}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--text-strong)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {net.toFixed(3)} {nr.unit || 'L'}
                </td>
              </tr>
            );
          })}
          {fuelUnits.map((u) => {
            const ru = (nozzleReadings as any[]).filter((r) => (r.unit || 'L') === u);
            const g = ru.reduce((s, r) => s + Number(r.volumeSold || 0), 0);
            const t = ru.reduce((s, r) => s + Number(r.testingVolume || 0), 0);
            const n = ru.reduce((s, r) => s + nozzleNet(r), 0);
            return (
              <tr
                key={u}
                style={{
                  borderTop: '2px solid var(--border-strong)',
                  backgroundColor: 'var(--bg-surface-alt)',
                  fontWeight: 700,
                }}
              >
                <td
                  colSpan={4}
                  style={{
                    padding: '12px 16px',
                    textTransform: 'uppercase',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }}
                >
                  Total — {u}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {g.toFixed(3)} {u}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {t.toFixed(3)} {u}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    color: 'var(--text-strong)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '14px',
                  }}
                >
                  {n.toFixed(3)} {u}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Product-wise Sales Summary */}
      {fuelByProduct && fuelByProduct.length > 0 && (
        <>
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-strong)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              marginTop: '32px',
            }}
          >
            Product-wise Fuel Sales
          </h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: '32px',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--bg-surface-alt)',
                  borderBottom: '1px solid var(--border-soft)',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Product</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Gross Vol
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Testing
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Net Sold
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Sales Value (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {fuelByProduct.map((p: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td
                    style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}
                  >
                    {p.productName}
                    {p.productCode ? ` (${p.productCode})` : ''}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {Number(p.grossVolume || 0).toFixed(3)} {p.unit || 'L'}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color:
                        Number(p.testingVolume || 0) > 0
                          ? 'var(--brand-warning)'
                          : 'var(--text-muted)',
                    }}
                  >
                    {Number(p.testingVolume || 0).toFixed(3)} {p.unit || 'L'}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {Number(p.netVolume || 0).toFixed(3)} {p.unit || 'L'}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(p.salesValue)}
                  </td>
                </tr>
              ))}
              {Array.from(new Set((fuelByProduct as any[]).map((p) => p.unit || 'L'))).map((u) => {
                const pu = (fuelByProduct as any[]).filter((p) => (p.unit || 'L') === u);
                const g = pu.reduce((s, p) => s + Number(p.grossVolume || 0), 0);
                const t = pu.reduce((s, p) => s + Number(p.testingVolume || 0), 0);
                const n = pu.reduce((s, p) => s + Number(p.netVolume || 0), 0);
                const sv = pu.reduce((s, p) => s + Number(p.salesValue || 0), 0);
                return (
                  <tr
                    key={u}
                    style={{
                      borderTop: '2px solid var(--border-strong)',
                      backgroundColor: 'var(--bg-surface-alt)',
                      fontWeight: 700,
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 16px',
                        textTransform: 'uppercase',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Total — {u}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {g.toFixed(3)} {u}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {t.toFixed(3)} {u}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-strong)',
                      }}
                    >
                      {n.toFixed(3)} {u}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-strong)',
                        fontSize: '14px',
                      }}
                    >
                      {inr(sv)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Attendant Handovers Summary */}
      {handovers && handovers.length > 0 && (
        <>
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-strong)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              marginTop: '32px',
            }}
          >
            Attendant Handovers Summary
          </h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: '32px',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--bg-surface-alt)',
                  borderBottom: '1px solid var(--border-soft)',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Attendant</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Dispenser</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Cash (₹)
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Card/UPI (₹)
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Credit Chits (₹)
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Expected Sales (₹)
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Variance (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {handovers.map((h: any, idx: number) => {
                const cash = Number(h.cashHandedOver || 0);
                const cardUpi = Number(h.cardHandedOver || 0) + Number(h.upiHandedOver || 0);
                const credit = Number(h.creditHandedOver || 0);
                const expected = Number(h.expectedSales || 0);
                const variance = Number(h.varianceAmount || 0);
                const varColor = varianceColor(variance);

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td
                      style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}
                    >
                      {h.attendantName}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-default)' }}>
                      {h.duCode}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(cash)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(cardUpi)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(credit)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600,
                      }}
                    >
                      {inr(expected)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: varColor,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {variance > 0 ? '+' : ''}
                      {inr(variance)}
                    </td>
                  </tr>
                );
              })}
              {(() => {
                const tCash = handovers.reduce(
                  (s: number, h: any) => s + Number(h.cashHandedOver || 0),
                  0,
                );
                const tCardUpi = handovers.reduce(
                  (s: number, h: any) =>
                    s + Number(h.cardHandedOver || 0) + Number(h.upiHandedOver || 0),
                  0,
                );
                const tCredit = handovers.reduce(
                  (s: number, h: any) => s + Number(h.creditHandedOver || 0),
                  0,
                );
                const tExpected = handovers.reduce(
                  (s: number, h: any) => s + Number(h.expectedSales || 0),
                  0,
                );
                const tVariance: number = handovers.reduce(
                  (s: number, h: any) => s + Number(h.varianceAmount || 0),
                  0,
                );
                const tVarColor = varianceColor(tVariance);
                return (
                  <tr
                    style={{
                      borderTop: '2px solid var(--border-strong)',
                      backgroundColor: 'var(--bg-surface-alt)',
                      fontWeight: 700,
                    }}
                  >
                    <td
                      colSpan={2}
                      style={{
                        padding: '12px 16px',
                        textTransform: 'uppercase',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Totals
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-strong)',
                      }}
                    >
                      {inr(tCash)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-strong)',
                      }}
                    >
                      {inr(tCardUpi)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-strong)',
                      }}
                    >
                      {inr(tCredit)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-strong)',
                      }}
                    >
                      {inr(tExpected)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: tVarColor,
                        fontSize: '14px',
                      }}
                    >
                      {tVariance > 0 ? '+' : ''}
                      {inr(tVariance)}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </>
      )}

      {/* POS Terminal Settlement Summary */}
      {terminalBreakdown && terminalBreakdown.length > 0 && (
        <>
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-strong)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              marginTop: '32px',
            }}
          >
            POS Terminal Settlement Summary
          </h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: '32px',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--bg-surface-alt)',
                  borderBottom: '1px solid var(--border-soft)',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Terminal</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Handled By</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Card (₹)
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  UPI (₹)
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Total (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {terminalBreakdown.map((t: any, idx: number) => {
                const card = Number(t.card || 0);
                const upi = Number(t.upi || 0);
                const contributors = (t.entries || []).filter(
                  (e: any) => Number(e.card || 0) > 0 || Number(e.upi || 0) > 0,
                );
                return (
                  <tr
                    key={idx}
                    style={{ borderBottom: '1px solid var(--border-soft)', verticalAlign: 'top' }}
                  >
                    <td
                      style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}
                    >
                      {t.terminalLabel}
                      {t.provider && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            color: 'var(--text-faint)',
                            fontWeight: 500,
                          }}
                        >
                          {t.provider}
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: 'var(--text-default)',
                        fontSize: '12px',
                      }}
                    >
                      {contributors.length > 0 ? (
                        contributors.map((e: any, i: number) => (
                          <div
                            key={i}
                            style={{ marginBottom: i < contributors.length - 1 ? '4px' : 0 }}
                          >
                            {e.attendantName}
                            {e.duCode ? ` · ${e.duCode}` : ''}
                          </div>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(card)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(upi)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: 'var(--text-strong)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inr(card + upi)}
                    </td>
                  </tr>
                );
              })}
              <tr
                style={{
                  borderTop: '2px solid var(--border-strong)',
                  backgroundColor: 'var(--bg-surface-alt)',
                  fontWeight: 700,
                }}
              >
                <td
                  colSpan={2}
                  style={{
                    padding: '12px 16px',
                    textTransform: 'uppercase',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }}
                >
                  POS Totals
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-strong)',
                  }}
                >
                  {inr(terminalBreakdown.reduce((s: number, t: any) => s + Number(t.card || 0), 0))}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-strong)',
                  }}
                >
                  {inr(terminalBreakdown.reduce((s: number, t: any) => s + Number(t.upi || 0), 0))}
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-strong)',
                    fontSize: '14px',
                  }}
                >
                  {inr(
                    terminalBreakdown.reduce(
                      (s: number, t: any) => s + Number(t.card || 0) + Number(t.upi || 0),
                      0,
                    ),
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* Fuel-on-Credit Sales (receivables billed during the shift) */}
      {creditSales && creditSales.length > 0 && (
        <>
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-strong)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              marginTop: '32px',
            }}
          >
            Fuel-on-Credit Sales
          </h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: '32px',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--bg-surface-alt)',
                  borderBottom: '1px solid var(--border-soft)',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Vehicle</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Product</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Qty</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Notes</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>
                  Amount (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {creditSales.map((r: any, idx: number) => (
                <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td
                    style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-strong)' }}
                  >
                    {r.customerName || 'Customer'}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      color: 'var(--text-default)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {r.vehicleNumber || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-default)' }}>
                    {r.productName || '—'}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {r.quantity != null
                      ? `${Number(r.quantity).toLocaleString('en-IN', { minimumFractionDigits: 3 })} ${r.unit || 'L'}`
                      : '—'}
                  </td>
                  <td
                    style={{ padding: '12px 16px', color: 'var(--text-faint)', fontSize: '12px' }}
                  >
                    {r.notes || '—'}
                  </td>
                  <td
                    style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {inr(r.amount)}
                  </td>
                </tr>
              ))}
              <tr
                style={{
                  borderTop: '2px solid var(--border-strong)',
                  backgroundColor: 'var(--bg-surface-alt)',
                  fontWeight: 700,
                }}
              >
                <td
                  colSpan={5}
                  style={{
                    padding: '12px 16px',
                    textTransform: 'uppercase',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }}
                >
                  Total Credit Sales
                </td>
                <td
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-strong)',
                    fontSize: '14px',
                  }}
                >
                  {inr(
                    Number(creditSalesTotal) ||
                      creditSales.reduce((s: number, r: any) => s + Number(r.amount || 0), 0),
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* Cash Reconciliation Summary */}
      <h3
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-strong)',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}
      >
        Cash Reconciliation & Variances
      </h3>
      <div
        style={{
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-input)',
          display: 'flex',
          flexDirection: 'column',
          fontSize: '13px',
          overflow: 'hidden',
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <span>Opening Cash Float</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {inr(openingCash)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)',
            color: 'var(--state-success-fg)',
          }}
        >
          <span>(+) Cash Sales (Attendant Handovers)</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            + {inr(cashSalesSum)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)',
            color: 'var(--state-success-fg)',
          }}
        >
          <span>(+) Cash Collections</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            + {inr(cashCollectionsSum)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)',
            color: 'var(--brand-danger)',
          }}
        >
          <span>(-) Petty Cash Expenses</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            - {inr(cashExpensesSum)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)',
            fontWeight: 600,
          }}
        >
          <span>Expected Cash in Drawer</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {inr(expectedCash)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <span>Actual Closing Cash (Entered)</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            {inr(closingCash)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor:
              Math.abs(cashVariance) > 100 ? 'var(--state-danger-bg)' : 'var(--bg-surface-alt)',
            fontWeight: 700,
            fontSize: '14px',
            color: Math.abs(cashVariance) > 100 ? 'var(--state-danger-fg)' : 'var(--text-strong)',
          }}
        >
          <span>Cash Variance</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
            }}
          >
            {cashVariance > 0 ? '+' : ''}
            {inr(cashVariance)}
            {cashVariance === 0
              ? ' (Perfect Match)'
              : Math.abs(cashVariance) > 100
                ? ` (Discrepancy)`
                : ''}
          </span>
        </div>
      </div>

      {/* Non-Cash Collections by channel (customer account payments received) */}
      <h3
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-strong)',
          marginBottom: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}
      >
        Non-Cash Collections
      </h3>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        Customer account payments received via card, UPI or direct bank transfer this shift. These
        settle receivables and do not touch the cash drawer. Fuel-on-credit <em>sales</em> are
        listed separately above.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div
          style={{
            padding: '12px',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-input)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'block',
              fontWeight: 600,
            }}
          >
            Card Collections
          </span>
          <strong
            style={{
              fontSize: '15px',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {inr(cardCollectionsSum)}
          </strong>
        </div>
        <div
          style={{
            padding: '12px',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-input)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'block',
              fontWeight: 600,
            }}
          >
            UPI/QR Collections
          </span>
          <strong
            style={{
              fontSize: '15px',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {inr(upiCollectionsSum)}
          </strong>
        </div>
        <div
          style={{
            padding: '12px',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-input)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'block',
              fontWeight: 600,
            }}
          >
            Bank Transfer Collections
          </span>
          <strong
            style={{
              fontSize: '15px',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {inr(bankCollectionsSum)}
          </strong>
        </div>
      </div>

      {/* Shift Transaction Logs Breakdown */}
      {expenses.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <h4
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}
          >
            Shift Petty Cash Expenses
          </h4>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-strong)',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '6px 8px' }}>Category</th>
                <th style={{ padding: '6px 8px' }}>Description</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{e.categoryName}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                    {e.description}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: 'var(--brand-danger)',
                    }}
                  >
                    - {inr(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {purchases.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <h4
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}
          >
            Supplier Fuel Intakes
          </h4>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-strong)',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '6px 8px' }}>Supplier</th>
                <th style={{ padding: '6px 8px' }}>Ref / Invoice</th>
                <th style={{ padding: '6px 8px' }}>Notes</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{p.supplierName}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-default)' }}>
                    {p.documentNumber} {p.invoiceNumber ? `(${p.invoiceNumber})` : ''}
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{p.notes}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                    {inr(p.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {collections.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h4
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}
          >
            Collections & Account Sales Logs
          </h4>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-strong)',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '6px 8px' }}>Customer</th>
                <th style={{ padding: '6px 8px' }}>Method</th>
                <th style={{ padding: '6px 8px' }}>Notes</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{c.customerName}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <span
                      style={{
                        backgroundColor:
                          c.paymentMethod === 'Credit'
                            ? 'var(--state-warning-bg)'
                            : 'var(--state-success-bg)',
                        color:
                          c.paymentMethod === 'Credit'
                            ? 'var(--state-warning-fg)'
                            : 'var(--state-success-fg)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      {c.paymentMethod}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{c.notes}</td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color:
                        c.paymentMethod === 'Credit'
                          ? 'var(--text-muted)'
                          : 'var(--state-success-fg)',
                    }}
                  >
                    {inr(c.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Late Transaction Auditing Console (Visible to Owner, Manager, Accountant when CLOSED, read-only when LOCKED) */}
      {userRole !== 'Staff' && (
        <div style={{ marginTop: '32px', marginBottom: '32px' }} className="no-print">
          <h3
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-strong)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            Audit Adjustments & Transaction Entry
          </h3>
          <ShiftTransactionsPanel
            shiftId={shiftId}
            nozzles={nozzleReadings}
            onTransactionAdded={onTransactionAdded}
            isReadOnly={shiftStatus === 'LOCKED'}
          />
        </div>
      )}

      {/* Signatures placeholder for paper outputs */}
      <div
        style={{
          marginTop: '60px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '40px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}
        className="print-only-block"
      >
        <div>
          <div
            style={{
              borderBottom: '1px solid var(--border-strong)',
              height: '40px',
              marginBottom: '8px',
            }}
          ></div>
          <span>Operator / Reconciliation Staff Signature</span>
        </div>
        <div>
          <div
            style={{
              borderBottom: '1px solid var(--border-strong)',
              height: '40px',
              marginBottom: '8px',
            }}
          ></div>
          <span>Owner / Manager Verification Signature</span>
        </div>
      </div>
    </div>
  );
};
