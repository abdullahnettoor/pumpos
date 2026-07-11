import React from 'react';
import { inr } from '../../utils/format.js';
import { KpiStrip, KpiTile } from '../../pump-ds/index.js';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>Operational summary</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Real-time totals for the current shift.</p>
      </div>
      <KpiStrip columns="auto">
        <KpiTile dot="danger" valueTone="danger" label="Petty Expenses" value={inr(shiftTotals.cashExpenses)} hint={`${shiftTotals.expenseCount} ${shiftTotals.expenseCount === 1 ? 'item' : 'items'}`} />
        <KpiTile dot="success" valueTone="success" label="Cash Handed Over" value={inr(cashCollections)} hint={`${handoverCount} ${handoverCount === 1 ? 'handover' : 'handovers'}`} />
        <KpiTile dot="info" label="Card & UPI Handover" value={inr(cardCollections + upiCollections)} hint={`Card ${inr(cardCollections)} · UPI ${inr(upiCollections)}`} />
        <KpiTile dot="warning" valueTone="warning" label="Credit Fleet Chits" value={inr(creditSales)} hint={`Logged ${inr(shiftTotals.creditSales)}`} />
        <KpiTile dot="brand" label="Supplier Purchases" value={inr(shiftTotals.purchaseTotal)} hint={`${shiftTotals.purchaseCount} ${shiftTotals.purchaseCount === 1 ? 'drop' : 'drops'}`} />
      </KpiStrip>
    </div>
  );
};
