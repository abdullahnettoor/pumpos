import React from 'react';
import { Panel, SectionHeader, StatementTable } from '../../pump-ds/index.js';
import {
  LEGACY_PURCHASE_COLUMNS,
  SHIFT_SUMMARY_TITLES,
  legacyPurchaseRows,
  legacyPurchaseTotalRow,
} from './shiftSummaryColumns.js';

/**
 * "Supplier fuel intakes" from an older Shift Summary snapshot. Purchases anchor
 * to the business day, never a Shift (ADR 0005, #308), so new snapshots hold
 * none and this renders nothing. Old snapshots are never recalculated, so the
 * purchases they stored keep showing. The PDF prints the same columns (#595).
 */
export const LegacyPurchasesTable: React.FC<{ snapshot: unknown }> = ({ snapshot }) => {
  const rows = legacyPurchaseRows(snapshot);
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={SHIFT_SUMMARY_TITLES.legacyPurchases} />
      <Panel>
        <StatementTable
          columns={LEGACY_PURCHASE_COLUMNS}
          rows={rows}
          rowKey={(r) => r.key}
          totalRow={legacyPurchaseTotalRow(rows)}
          label={SHIFT_SUMMARY_TITLES.legacyPurchases}
        />
      </Panel>
    </section>
  );
};
