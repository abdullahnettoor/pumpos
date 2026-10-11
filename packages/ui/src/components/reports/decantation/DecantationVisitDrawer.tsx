import React from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { DecantationReportVisit } from '@pump/shared';
import { Drawer } from '../../Drawer.js';
import { Chip } from '../../../pump-ds/index.js';
import { formatDateTime, formatQty } from '../../../utils/format.js';
import { muted, td, tdR, th, thR } from './styles.js';

export const DecantationVisitDrawer: React.FC<{
  visit: DecantationReportVisit;
  onClose: () => void;
}> = ({ visit, onClose }) => (
  <Drawer
    isOpen
    onClose={onClose}
    title={`Tanker Visit: ${visit.tankerNumber}`}
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
          <div style={{ fontWeight: 600 }}>{visit.date}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Document Number</div>
          <div style={{ fontWeight: 600 }}>{visit.documentNumber}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Driver</div>
          <div style={{ fontWeight: 600 }}>{visit.driverName || '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Status</div>
          <Chip
            size="xs"
            tone={
              visit.status === 'MEASURED'
                ? 'success'
                : visit.status === 'PENDING_MEASUREMENT'
                  ? 'warning'
                  : 'neutral'
            }
            variant="soft"
          >
            {visit.status}
          </Chip>
        </div>
        {visit.unloadStartedAt && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unload Time</div>
            <div style={{ fontSize: '12px' }}>
              {formatDateTime(visit.unloadStartedAt)}
              {visit.unloadEndedAt ? ` - ${formatDateTime(visit.unloadEndedAt)}` : ''}
            </div>
          </div>
        )}
      </div>

      {/* Flags */}
      {visit.flags.length > 0 && (
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
          {visit.flags.map((f, i) => (
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
          {visit.chamberSummary.hasTransitDiscrepancy ? (
            <Chip size="xs" tone="danger" variant="soft">
              Transit Discrepancy Found
            </Chip>
          ) : (
            <Chip size="xs" tone="success" variant="soft">
              Seals & Dips OK
            </Chip>
          )}
        </div>

        {visit.chambers.length === 0 ? (
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
              {visit.chambers.map((ch) => (
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
                        ch.mark === 'SHORT' ? 'danger' : ch.mark === 'EXCESS' ? 'info' : 'neutral'
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
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Yes</span>
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
            {visit.tankLines.map((line) => (
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
                  {line.receivedQty !== null ? `${formatQty(line.receivedQty, 2)} L` : 'Pending'}
                </td>
                <td style={tdR}>{line.roDensity !== null ? `${line.roDensity}` : '—'}</td>
                <td style={tdR}>{line.invoiceDensity !== null ? `${line.invoiceDensity}` : '—'}</td>
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
            {visit.invoiceLinks.map((inv, idx) => (
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
      {visit.notes && (
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
            {visit.notes}
          </div>
        </div>
      )}
    </div>
  </Drawer>
);
