import React from 'react';

interface ShiftTotals {
  cashExpenses: number;
  creditSales: number;
  expenseCount: number;
  purchaseCount: number;
  purchaseTotal: number;
}

interface ShiftTotalsSummaryProps {
  shiftTotals: ShiftTotals;
  cashCollections: number;
  cardCollections: number;
  upiCollections: number;
  creditSales: number;
  handoverCount: number;
}

/**
 * Real-time operational summary tiles for the active shift (petty expenses, cash/card/UPI
 * handovers, credit chits, supplier purchases). Pure presentational — extracted from
 * ShiftsManagement.
 */
export const ShiftTotalsSummary: React.FC<ShiftTotalsSummaryProps> = ({
  shiftTotals,
  cashCollections,
  cardCollections,
  upiCollections,
  creditSales,
  handoverCount,
}) => {
  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-soft)',
      borderRadius: 'var(--radius-card)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      marginTop: '8px',
      marginBottom: '8px'
    }}>
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
          Operational Summary (Current Shift)
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Real-time summary of transactions logged via sidebar modules for this active shift.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '16px'
      }}>
        <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Petty Expenses</span>
          <strong style={{ fontSize: '15px', color: 'var(--brand-danger)', fontFamily: 'var(--font-mono)' }}>
            ₹{shiftTotals.cashExpenses.toLocaleString('en-IN')}
          </strong>
          <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
            {shiftTotals.expenseCount} items recorded
          </span>
        </div>

        <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Cash Handed Over</span>
          <strong style={{ fontSize: '15px', color: 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
            ₹{cashCollections.toLocaleString('en-IN')}
          </strong>
          <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
            {handoverCount} handovers received
          </span>
        </div>

        <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Card & UPI Handover</span>
          <strong style={{ fontSize: '15px', color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
            ₹{(cardCollections + upiCollections).toLocaleString('en-IN')}
          </strong>
          <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
            Card: ₹{cardCollections.toLocaleString('en-IN')} • UPI: ₹{upiCollections.toLocaleString('en-IN')}
          </span>
        </div>

        <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Credit Fleet Chits</span>
          <strong style={{ fontSize: '15px', color: 'var(--brand-warning)', fontFamily: 'var(--font-mono)' }}>
            ₹{creditSales.toLocaleString('en-IN')}
          </strong>
          <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
            Logged Bills: ₹{shiftTotals.creditSales.toLocaleString('en-IN')}
          </span>
        </div>

        <div style={{ padding: '12px', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-input)', backgroundColor: 'var(--bg-canvas)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>Supplier Purchases</span>
          <strong style={{ fontSize: '15px', color: 'var(--brand-secondary)', fontFamily: 'var(--font-mono)' }}>
            ₹{shiftTotals.purchaseTotal.toLocaleString('en-IN')}
          </strong>
          <span style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginTop: '2px' }}>
            {shiftTotals.purchaseCount} drops recorded
          </span>
        </div>
      </div>
    </div>
  );
};
