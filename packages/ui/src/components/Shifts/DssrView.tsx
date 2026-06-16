import React, { useState } from 'react';
import { CloudShiftService } from '../../services/cloud.js';
import { StatusBadge } from '../StatusBadge.js';
import { ArrowLeft, Printer, Unlock, AlertTriangle } from 'lucide-react';
import { ShiftTransactionsPanel } from './ShiftTransactionsPanel.js';

const shiftService = new CloudShiftService();

interface DssrViewProps {
  dssr: any; // dssrSnapshots record
  userRole: 'Owner' | 'Manager' | 'Accountant' | 'Staff';
  canReopen: boolean;
  gracePeriodExpiresAt?: string | null;
  onReopenSuccess: () => void;
  onBack?: () => void;
  shiftStatus?: 'CLOSED' | 'LOCKED';
  onTransactionAdded?: () => void;
}

export const DssrView: React.FC<DssrViewProps> = ({
  dssr,
  userRole,
  canReopen,
  gracePeriodExpiresAt,
  onReopenSuccess,
  onBack,
  shiftStatus = 'CLOSED',
  onTransactionAdded,
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
    nozzleReadings = [],
    totalVolumeSold = 0,
    warnings = [],
    expectedCash = Number(openingCash),
    cashVariance = 0,
    cashCollectionsSum = 0,
    cardCollectionsSum = 0,
    upiCollectionsSum = 0,
    creditSalesSum = 0,
    cashExpensesSum = 0,
    expenses = [],
    purchases = [],
    collections = [],
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
          <ArrowLeft size={13} style={{ marginRight: '6px' }} /> Back to Workspace
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
            <Printer size={13} style={{ marginRight: '6px' }} /> Print DSSR
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
              {reopening ? 'Reopening...' : (
                <>
                  <Unlock size={13} style={{ marginRight: '6px' }} /> Reopen Shift
                </>
              )}
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
          <strong style={{ display: 'block', marginBottom: '6px' }}>
            <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> Warnings Captured at Close Time:
          </strong>
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
        Cash Reconciliation & Variances
      </h3>
      <div style={{
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-input)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '13px',
        overflow: 'hidden',
        marginBottom: '28px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Opening Cash Float</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{Number(openingCash).toLocaleString('en-IN')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)', color: 'var(--state-success-fg)' }}>
          <span>(+) Cash Collections</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>+ ₹{Number(cashCollectionsSum).toLocaleString('en-IN')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)', color: 'var(--brand-danger)' }}>
          <span>(-) Petty Cash Expenses</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>- ₹{Number(cashExpensesSum).toLocaleString('en-IN')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)', fontWeight: 600 }}>
          <span>Expected Cash in Drawer</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{Number(expectedCash).toLocaleString('en-IN')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Actual Closing Cash (Entered)</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{Number(closingCash).toLocaleString('en-IN')}</span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: Math.abs(cashVariance) > 100 ? 'var(--state-danger-bg)' : 'var(--bg-surface-alt)',
          fontWeight: 700,
          fontSize: '14px',
          color: Math.abs(cashVariance) > 100 ? 'var(--state-danger-fg)' : 'var(--text-strong)'
        }}>
          <span>Cash Variance</span>
          <span style={{
            fontFamily: 'var(--font-mono)'
          }}>
            {cashVariance > 0 ? '+' : ''}₹{Number(cashVariance).toLocaleString('en-IN')}
            {cashVariance === 0 ? ' (Perfect Match)' : Math.abs(cashVariance) > 100 ? ` (Discrepancy)` : ''}
          </span>
        </div>
      </div>

      {/* Non-Cash Collections & Ledger Sales */}
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Non-Cash Payments & Credit Sales
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-surface)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Card Payments</span>
          <strong style={{ fontSize: '15px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>₹{Number(cardCollectionsSum).toLocaleString('en-IN')}</strong>
        </div>
        <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-surface)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>UPI/QR Payments</span>
          <strong style={{ fontSize: '15px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>₹{Number(upiCollectionsSum).toLocaleString('en-IN')}</strong>
        </div>
        <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-surface)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Credit Account Sales</span>
          <strong style={{ fontSize: '15px', color: 'var(--brand-warning)', fontFamily: 'var(--font-mono)' }}>₹{Number(creditSalesSum).toLocaleString('en-IN')}</strong>
        </div>
      </div>

      {/* Shift Transaction Logs Breakdown */}
      {expenses.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Shift Petty Cash Expenses
          </h4>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '6px 8px' }}>Category</th>
                <th style={{ padding: '6px 8px' }}>Description</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e: any, idx: number) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{e.categoryName}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{e.description}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--brand-danger)' }}>- ₹{Number(e.amount).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {purchases.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Supplier Fuel Intakes
          </h4>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
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
                  <td style={{ padding: '6px 8px', color: 'var(--text-default)' }}>{p.documentNumber} {p.invoiceNumber ? `(${p.invoiceNumber})` : ''}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{p.notes}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>₹{Number(p.amount).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {collections.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Collections & Account Sales Logs
          </h4>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
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
                    <span style={{
                      backgroundColor: c.paymentMethod === 'Credit' ? 'var(--state-warning-bg)' : 'var(--state-success-bg)',
                      color: c.paymentMethod === 'Credit' ? 'var(--state-warning-fg)' : 'var(--state-success-fg)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600
                    }}>
                      {c.paymentMethod}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{c.notes}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: c.paymentMethod === 'Credit' ? 'var(--text-muted)' : 'var(--state-success-fg)' }}>
                    ₹{Number(c.amount).toLocaleString('en-IN')}
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
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
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
