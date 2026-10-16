import { can, type Principal } from './catalogue.js';

type Loose = Record<string, unknown>;

/**
 * Strip the sensitive figures from a DSSR payload (persisted row or live
 * preview, `{ snapshotData }`) the principal may not see. The server is the
 * gate: `finance.viewMargin` guards COGS / margin, `purchases.viewCosts` the
 * purchase value. Revenue and counts stay.
 */
export function redactSensitiveDssr<T>(row: T, principal: Principal): T {
  if (!row || typeof row !== 'object') return row;
  const data = (row as { snapshotData?: unknown }).snapshotData;
  if (!data || typeof data !== 'object') return row;
  const next: Loose = { ...(data as Loose) };
  if (!can(principal, 'finance.viewMargin') && next.pnl && typeof next.pnl === 'object') {
    const pnl = next.pnl as Loose;
    next.pnl = { ...(pnl.revenue !== undefined ? { revenue: pnl.revenue } : {}) };
  }
  if (!can(principal, 'purchases.viewCosts') && next.purchases && typeof next.purchases === 'object') {
    const { total: _total, ...rest } = next.purchases as Loose;
    next.purchases = rest;
  }
  return { ...row, snapshotData: next };
}

const PURCHASE_COST_FIELDS = [
  'amount',
  'taxableAmount',
  'cgstTotal',
  'sgstTotal',
  'igstTotal',
  'vatTotal',
  'cessTotal',
  'roundOff',
  'totalAmount',
  'unitPrice',
  'cgst',
  'sgst',
  'igst',
  'vat',
  'cess',
  'lineTotal',
] as const;

/**
 * Null the price / cost fields of a purchase or purchase-line row when the
 * principal lacks `purchases.viewCosts`. Quantities, names and dates stay.
 */
export function redactPurchaseCosts<T extends object>(row: T, principal: Principal): T {
  if (can(principal, 'purchases.viewCosts')) return row;
  const next = { ...row } as Record<string, unknown>;
  for (const field of PURCHASE_COST_FIELDS) if (field in next) next[field] = null;
  return next as T;
}
