import React from 'react';
import { ArrowLeft, Printer, Download, AlertTriangle } from 'lucide-react';
import { exportReportPdf } from '../services/exportPdf.js';

interface DailyDssrViewProps {
  dailyDssr: any;
  onBack?: () => void;
}

export const DailyDssrView: React.FC<DailyDssrViewProps> = ({ dailyDssr, onBack }) => {
  const printRef = React.useRef<HTMLDivElement>(null);
  const snapshot = dailyDssr?.snapshotData || {};
  const nozzles = Object.values(snapshot.nozzles || {}) as Array<any>;
  const shifts = snapshot.shifts || [];
  const warnings = snapshot.warnings || [];

  const totalVolumeSold = Number(snapshot.totalVolumeSold || 0);
  const totalCashCollections = Number(snapshot.totalCashCollections || 0);
  const totalCardCollections = Number(snapshot.totalCardCollections || 0);
  const totalUpiCollections = Number(snapshot.totalUpiCollections || 0);
  const totalCreditSales = Number(snapshot.totalCreditSales || 0);
  const totalExpenses = Number(snapshot.totalExpenses || 0);

  return (
    <div ref={printRef} className="card card-comfortable print-area" style={{ maxWidth: '920px', margin: '0 auto' }}>
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-soft)',
          paddingBottom: '16px',
        }}
      >
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          <ArrowLeft size={13} /> Back to Reports
        </button>

        <button className="btn btn-secondary btn-sm" onClick={() => exportReportPdf(printRef.current, 'Daily_DSSR')}>
          <Download size={13} /> Save PDF
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
          <Printer size={13} /> Print Daily DSSR
        </button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h2
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--text-strong)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Daily Sales Summary Record
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
          Business Date {dailyDssr.businessDate} • Generated {new Date(dailyDssr.generatedAt).toLocaleString('en-IN')}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          padding: '20px',
          backgroundColor: 'var(--bg-surface-alt)',
          borderRadius: 'var(--radius-input)',
          marginBottom: '24px',
          border: '1px solid var(--border-soft)',
        }}
      >
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            Shifts Included
          </span>
          <strong style={{ fontSize: '16px', color: 'var(--text-strong)' }}>{snapshot.shiftsIncluded || 0}</strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            Fuel Volume Sold
          </span>
          <strong style={{ fontSize: '16px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
            {totalVolumeSold.toFixed(3)} L
          </strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Cash Collections
          </span>
          <strong style={{ fontSize: '16px', color: 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
            ₹{totalCashCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </strong>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 600 }}>
            Non Cash Collections
          </span>
          <strong style={{ fontSize: '16px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
            ₹{(totalCardCollections + totalUpiCollections).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </strong>
        </div>
      </div>

      {warnings.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--state-warning-bg)',
            color: 'var(--state-warning-fg)',
            padding: '16px',
            borderRadius: 'var(--radius-input)',
            marginBottom: '24px',
            fontSize: '12px',
            border: '1px solid var(--border-soft)',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '6px' }}>
            <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle', display: 'inline' }} /> Daily Warnings
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

      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Financial Summary
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
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Cash Collections</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{totalCashCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Card Collections</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{totalCardCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>UPI Collections</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>₹{totalUpiCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Credit Sales</span>
          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--brand-warning)' }}>₹{totalCreditSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', backgroundColor: 'var(--bg-surface-alt)' }}>
          <span>Total Cash Expenses</span>
          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-danger)' }}>₹{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Nozzle Aggregation
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Nozzle</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Product</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Reading Instances</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Total Volume (L)</th>
          </tr>
        </thead>
        <tbody>
          {nozzles.length > 0 ? (
            nozzles.map((nz: any, idx: number) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>{nz.nozzleName || 'Unknown'}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-default)' }}>{nz.productName || 'Unknown'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Number(nz.instances || 0).toLocaleString('en-IN')}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                  {Number(nz.totalVolume || 0).toFixed(3)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No nozzle data in this daily DSSR.
              </td>
            </tr>
          )}
          <tr style={{ borderTop: '2px solid var(--border-strong)', backgroundColor: 'var(--bg-surface-alt)', fontWeight: 700 }}>
            <td colSpan={3} style={{ padding: '10px 12px', textTransform: 'uppercase', fontSize: '11px', color: 'var(--text-muted)' }}>
              Total Fuel Sold
            </td>
            <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)', fontSize: '14px' }}>
              {totalVolumeSold.toFixed(3)}
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
        Included Shifts
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-strong)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Shift ID</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Template</th>
            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Closed At</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Cash Variance (₹)</th>
          </tr>
        </thead>
        <tbody>
          {shifts.length > 0 ? (
            shifts.map((shift: any, idx: number) => {
              const variance = Number(shift.cashVariance || 0);
              const varColor = variance < 0 ? 'var(--brand-danger)' : variance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)';
              return (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-strong)' }}>
                    {(shift.shiftId || '').slice(0, 8)}...
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-default)' }}>{shift.templateName || 'Custom'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-default)' }}>
                    {shift.closedAt ? new Date(shift.closedAt).toLocaleString('en-IN') : '-'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: varColor, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {variance > 0 ? '+' : ''}{variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={4} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No shifts were included for this day.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
