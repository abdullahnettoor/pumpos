/**
 * Purchases stored on a Shift Summary snapshot. Purchases anchor to the
 * business day, never a Shift (ADR 0005, #308), so new snapshots carry none;
 * older snapshots may still hold them and must keep rendering them, because a
 * snapshot is never recalculated.
 */
export interface LegacySnapshotPurchase {
  supplierName?: string | null;
  documentNumber?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  amount: number | string;
}

export function legacyPurchases(snapshot: unknown): LegacySnapshotPurchase[] {
  const list = (snapshot as { purchases?: unknown } | null | undefined)?.purchases;
  return Array.isArray(list) ? (list as LegacySnapshotPurchase[]) : [];
}
