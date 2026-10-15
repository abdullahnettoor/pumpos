import React from 'react';
import type { AttendantReportEntry } from '@pump/shared';
import { variancePresentation } from '@pump/shared';
import { VarianceChip, type KpiAlert, type TableColumn } from '../../../pump-ds/index.js';

/**
 * A variance tile is coloured only for a problem, in the variance vocabulary's
 * own tones: a shortage red, a surplus amber, balanced plain.
 */
export const varianceAlert = (amount: number): KpiAlert | undefined => {
  const { state } = variancePresentation(amount, 'cash');
  return state === 'short' ? 'danger' : state === 'surplus' ? 'warning' : undefined;
};

/** How many attendants ran short or over: the hint under the net figure. */
export function varianceSpread(attendants: AttendantReportEntry[]): string {
  let short = 0;
  let surplus = 0;
  for (const a of attendants) {
    const { state } = variancePresentation(a.totals.varianceAmount, 'cash');
    if (state === 'short') short += 1;
    if (state === 'surplus') surplus += 1;
  }
  if (short === 0 && surplus === 0) return 'all balanced';
  return [short > 0 && `${short} short`, surplus > 0 && `${surplus} surplus`]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The attendant list: one row per Attendant over the range, every figure from
 * that Attendant's closed-shift Handovers. Sales components are separate
 * columns, never added into one grand total across a row.
 *
 * Variance is not totalled: one attendant's surplus does not cover another's
 * shortage, so the net sits in the tile above, beside who was short.
 */
export const ATTENDANT_COLUMNS: TableColumn<AttendantReportEntry>[] = [
  {
    id: 'attendant',
    header: 'Attendant',
    kind: 'text',
    emphasis: true,
    value: (a) => a.attendantName,
  },
  {
    id: 'shifts',
    header: 'Shifts',
    kind: 'qty',
    // A count, not a quantity: no unit, and the tile hint carries the total.
    total: false,
    value: (a) => a.shiftsWorked,
    cell: (a) => String(a.shiftsWorked),
  },
  { id: 'cash', header: 'Cash', kind: 'money', value: (a) => a.totals.cashHandedOver },
  { id: 'card', header: 'Card', kind: 'money', value: (a) => a.totals.cardHandedOver },
  { id: 'upi', header: 'UPI', kind: 'money', value: (a) => a.totals.upiHandedOver },
  { id: 'credit', header: 'Credit', kind: 'money', value: (a) => a.totals.creditHandedOver },
  {
    id: 'fuel',
    header: 'Fuel expected',
    kind: 'money',
    value: (a) => a.totals.expectedFuelSales,
  },
  { id: 'billed', header: 'Billed', kind: 'money', value: (a) => a.totals.billedSales },
  {
    id: 'merch',
    header: 'Merch. handover',
    kind: 'money',
    value: (a) => a.totals.handoverProductSales,
  },
  { id: 'creditSales', header: 'Credit sales', kind: 'money', value: (a) => a.totals.creditSales },
  {
    id: 'variance',
    header: 'Variance',
    kind: 'money',
    total: false,
    value: (a) => a.totals.varianceAmount,
    cell: (a) => <VarianceChip amount={a.totals.varianceAmount} size="md" />,
  },
];
