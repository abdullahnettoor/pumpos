import React, { useState } from 'react';
import { CloudShiftService } from '../../services/cloud.js';
import { StatusBadge } from '../StatusBadge.js';

const shiftService = new CloudShiftService();

interface DssrViewProps {
  dssr: any; // dssrSnapshots record
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  canReopen: boolean;
  gracePeriodExpiresAt?: string | null;
  onReopenSuccess: () => void;
  onBack?: () => void;
}

export const DssrView: React.FC<DssrViewProps> = ({
  dssr,
  userRole,
  canReopen,
  gracePeriodExpiresAt,
  onReopenSuccess,
  onBack,
}) => {
  const [reopening, setReopening] = useState(false);

  const { snapshotData, generatedAt } = dssr;
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
    nozzleReadings,
    totalVolumeSold,
    warnings,
  } = snapshotData;

  const handleReopen = async () => {
    if (!window.confirm('Reopening this shift will delete this compiled DSSR snapshot and set the shift state back to OPEN. Proceed?')) {
      return;
    }
    try {
      setReopening(true);
      await shiftService.reopenShift(shiftId);
      onReopenSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to reopen shift');
    } finally {
      setReopening(false);
    }
  };

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-soft)',
      borderRadius: 'var(--radius-card)',
      padding: '32px',
      fontFamily: 'var(--font-sans)',
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* Header controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border-soft)', paddingBottom: '16px' }} className="no-print">
        <button
          onClick={onBack}
          style={{
            height: '32px',
            padding: '0 12px',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: 'var(--bg-surface-alt)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-button)',
            cursor: 'pointer',
            color: 'var(--text-default)'
          }}
        >
          ← Back to Workspace
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => window.print()}
            style={{
              height: '32px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-button)',
              cursor: 'pointer',
              color: 'var(--text-default)'
            }}
          >
            🖨️ Print DSSR
          </button>

          {canReopen && (
            <button
              onClick={handleReopen}
              disabled={reopening}
              style={{
                height: '32px',
                padding: '0 12px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: 'var(--state-danger-bg)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-button)',
                cursor: 'pointer',
                color: 'var(--state-danger-fg)'
              }}
            >
              {reopening ? 'Reopening...' : '🔓 Reopen Shift'}
            </button>
          )}
        </div>
      </div>

      {/* Audit Header Banner */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-strong)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Daily Sales Summary Record (DSSR)
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
          Authoritative Operational Snapshot • Compiled {new Date(generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Metadata Panel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        padding: '20px',
        backgroundColor: 'var(--bg-surface-alt)',
        borderRadius: 'var(--radius-input)',
        marginBottom: '28px',
        border: '1px solid var(--border-soft)'
      }}>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Shift ID</span>
          <strong style={{ fontSize: '13px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{shiftId.slice(0, 8)}...</strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Shift Template</span>
          <strong style={{ fontSize: '13px', color: 'var(--text-strong)' }}>{templateName}</strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Operational Duration</span>
          <strong style={{ fontSize: '12px', color: 'var(--text-strong)' }}>
            {new Date(openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>Reconciled By</span>
          <strong style={{ fontSize: '13px', color: 'var(--text-strong)' }}>{closedByName}</strong>
        </div>
      </div>

      {/* Warnings Panel */}
      {warnings && warnings.length > 0 && (
        <div style={{
          backgroundColor: 'var(--state-warning-bg)',
          color: 'var(--state-warning-fg)',
          padding: '16px',
          borderRadius: 'var(--radius-input)',
          marginBottom: '28px',
          fontSize: '12px',
          border: '1px solid var(--border-soft)'
        }}>
          <strong style={{ display: 'block', marginBottom: '6px' }}>⚠️ Warnings Captured at Close Time:</strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {warnings.map((warn: string, idx: number) => (
              <li key={idx} style={{ marginTop: '4px' }}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Nozzle Readings Table */}
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Nozzle Reconciliation & Volume Sold
      </h3>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        marginBottom: '32px',
        fontSize: '13px'
      }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nozzle</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Product</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Opening Rd</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Closing Rd</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Volume Sold</th>
          </tr>
        </thead>
        <tbody>
          {nozzleReadings.map((nr: any, idx: number) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>{nr.nozzleName}</td>
              <td style={{ padding: '10px 12px', color: 'var(--text-default)' }}>{nr.productName} ({nr.productCode})</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(nr.openingReading).toFixed(3)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(nr.closingReading).toFixed(3)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>{Number(nr.volumeSold).toFixed(3)} L</td>
            </tr>
          ))}
          <tr style={{ borderTop: '2px solid var(--border-strong)', backgroundColor: 'var(--bg-surface-alt)', fontWeight: 700 }}>
            <td colSpan={4} style={{ padding: '10px 12px', textTransform: 'uppercase', fontSize: '11px', color: 'var(--text-muted)' }}>Total Fuel Sold</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)', fontSize: '14px' }}>
              {Number(totalVolumeSold).toFixed(3)} L
            </td>
          </tr>
        </tbody>
      </table>

      {/* Cash Reconciliation Summary */}
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Cash Reconciliation
      </h3>
      <div style={{
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-input)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '13px',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Opening Cash (Float)</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{Number(openingCash).toLocaleString('en-IN')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Closing Cash (Collected)</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{Number(closingCash).toLocaleString('en-IN')}</span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '14px 16px',
          backgroundColor: 'var(--bg-surface-alt)',
          fontWeight: 700,
          fontSize: '14px'
        }}>
          <span>Net Shift Cash Flow</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            color: cashNetChange >= 0 ? 'var(--state-success-fg)' : 'var(--state-danger-fg)'
          }}>
            {cashNetChange >= 0 ? '+' : ''}₹{Number(cashNetChange).toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Signatures placeholder for paper outputs */}
      <div style={{
        marginTop: '60px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '40px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        textAlign: 'center'
      }} className="print-only-block">
        <div>
          <div style={{ borderBottom: '1px solid var(--border-strong)', height: '40px', marginBottom: '8px' }}></div>
          <span>Operator / Reconciliation Staff Signature</span>
        </div>
        <div>
          <div style={{ borderBottom: '1px solid var(--border-strong)', height: '40px', marginBottom: '8px' }}></div>
          <span>Owner / Manager Verification Signature</span>
        </div>
      </div>
    </div>
  );
};
