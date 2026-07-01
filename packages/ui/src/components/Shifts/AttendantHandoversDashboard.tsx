import React from 'react';
import { StatusBadge } from '../StatusBadge.js';
import { inr } from '../../utils/format.js';
interface AttendantHandoversDashboardProps {
  staffAssignments: any[];
  handovers: any[];
  onRecordHandover: (assignment: any) => void;
}

/**
 * Active-shift table listing each assigned attendant, their handover status and the
 * cash / card-UPI / credit / expected-sales / variance figures recorded for them.
 * Pure presentational — extracted from ShiftsManagement.
 */
export const AttendantHandoversDashboard: React.FC<AttendantHandoversDashboardProps> = ({
  staffAssignments,
  handovers,
  onRecordHandover,
}) => {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Attendant Handovers Dashboard
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Record dispenser nozzle closing readings, cash, card, UPI collections and credit chits per assigned attendant.
          </p>
        </div>
      </div>
      <div className="shift-table-scroll-container">
      <table className="shift-table" style={{ width: '100%', minWidth: '1020px', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '10px 20px', fontWeight: 600, position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--bg-surface-alt)', minWidth: '170px' }}>Attendant</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, position: 'sticky', left: 170, zIndex: 2, backgroundColor: 'var(--bg-surface-alt)', minWidth: '90px' }}>Dispenser</th>
            <th style={{ padding: '10px 20px', fontWeight: 600 }}>Handover Status</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Cash (₹)</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Card/UPI (₹)</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Credit Chits (₹)</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Expected Sales (₹)</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Variance (₹)</th>
            <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {staffAssignments && staffAssignments.length > 0 ? (
            staffAssignments.map((sa: any, idx: number) => {
              const handoverRecord = handovers.find(
                (h: any) => h.userId === sa.userId && h.duId === sa.duId
              );
              const isRecorded = !!handoverRecord;

              return (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)', position: 'sticky', left: 0, zIndex: 1, backgroundColor: 'var(--bg-surface)', minWidth: '170px' }}>
                    {sa.userName}
                  </td>
                  <td style={{ padding: '12px 12px', color: 'var(--text-default)', position: 'sticky', left: 170, zIndex: 1, backgroundColor: 'var(--bg-surface)', minWidth: '90px' }}>
                    {sa.duCode || sa.duName}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <StatusBadge
                      status={isRecorded ? 'RECORDED' : 'PENDING'}
                      type={isRecorded ? 'success' : 'warning'}
                    />
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {isRecorded ? `₹${Number(handoverRecord.cashHandedOver).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {isRecorded ? `₹${(Number(handoverRecord.cardHandedOver) + Number(handoverRecord.upiHandedOver)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {isRecorded
                      ? `₹${Number(handoverRecord.creditHandedOver).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : Number(sa.creditTotal ?? 0) > 0
                        ? `₹${Number(sa.creditTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                        : '—'}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {isRecorded
                      ? `₹${Number(handoverRecord.expectedSales).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : (() => {
                          const merch = Number(sa.attributed?.merchandiseTotal ?? 0);
                          if (merch <= 0) return '—';
                          return (
                            <span title={`Merchandise sold by this attendant (reconciles at shift close): ${inr(merch)}`} style={{ color: 'var(--brand-warning)', fontWeight: 500 }}>
                              +₹{merch.toLocaleString('en-IN', { minimumFractionDigits: 2 })} merchandise
                            </span>
                          );
                        })()}
                  </td>
                  <td style={{
                    padding: '12px 20px',
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: !isRecorded ? 'var(--text-default)' : Number(handoverRecord.varianceAmount) === 0 ? 'var(--state-success-fg)' : Number(handoverRecord.varianceAmount) > 0 ? 'var(--brand-warning)' : 'var(--brand-danger)'
                  }}>
                    {isRecorded ? (
                      <>
                        {Number(handoverRecord.varianceAmount) > 0 ? '+' : ''}
                        ₹{Number(handoverRecord.varianceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px 20px', textAlign: 'center' }}>
                    <button
                      type="button"
                      className={isRecorded ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"}
                      onClick={() => onRecordHandover(sa)}
                    >
                      {isRecorded ? 'Edit Handover' : 'Record Handover'}
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={9} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No staff assignments found for this active shift. Assign staff dispensers in the setup to record handovers.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
};
