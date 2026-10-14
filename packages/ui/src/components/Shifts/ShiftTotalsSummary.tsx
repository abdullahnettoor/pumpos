import React from 'react';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile } from '../../pump-ds/index.js';

interface ShiftTotals {
  cashExpenses: number;
  creditSales: number;
  expenseCount: number;
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
 * handovers, credit chits). Pure presentational — extracted from
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
          Operational summary
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Real-time totals for the current shift.
        </p>
      </div>
      <KpiStrip columns="auto">
        <KpiTile
          label="Petty expenses"
          value={inr(shiftTotals.cashExpenses)}
          hint={`${shiftTotals.expenseCount} ${shiftTotals.expenseCount === 1 ? 'item' : 'items'}`}
        />
        <KpiTile
          label="Cash handed over"
          value={inr(cashCollections)}
          hint={`${handoverCount} ${handoverCount === 1 ? 'handover' : 'handovers'}`}
        />
        <KpiTile
          label="Card & UPI handover"
          value={inr(cardCollections + upiCollections)}
          hint={`Card ${inr(cardCollections)} · UPI ${inr(upiCollections)}`}
        />
        <KpiTile
          label="Credit fleet chits"
          value={inr(creditSales)}
          hint={`Logged ${inr(shiftTotals.creditSales)}`}
        />
      </KpiStrip>
    </div>
  );
};
