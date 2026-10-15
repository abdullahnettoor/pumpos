import React from 'react';
import { Panel, SectionHeader, StatementTable, type TableColumn } from '../../pump-ds/index.js';
import {
  legacyPurchases,
  type LegacySnapshotPurchase,
} from '../../services/reports/legacyPurchases.js';

type Row = LegacySnapshotPurchase & { key: string };

const COLUMNS: TableColumn<Row>[] = [
  {
    id: 'supplier',
    header: 'Supplier',
    kind: 'text',
    emphasis: true,
    value: (r) => r.supplierName,
  },
  {
    id: 'ref',
    header: 'Ref / invoice',
    kind: 'text',
    value: (r) =>
      [r.documentNumber, r.invoiceNumber && `(${r.invoiceNumber})`].filter(Boolean).join(' ') ||
      null,
  },
  { id: 'notes', header: 'Notes', kind: 'text', value: (r) => r.notes },
  { id: 'amount', header: 'Amount', kind: 'money', value: (r) => r.amount },
];

/**
 * "Supplier Fuel Intakes" from an older Shift Summary snapshot. Purchases anchor
 * to the business day, never a Shift (ADR 0005, #308), so new snapshots hold
 * none and this renders nothing. Old snapshots are never recalculated, so the
 * purchases they stored keep showing.
 */
export const LegacyPurchasesTable: React.FC<{ snapshot: unknown }> = ({ snapshot }) => {
  const rows: Row[] = legacyPurchases(snapshot).map((p, i) => ({ ...p, key: String(i) }));
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="Supplier Fuel Intakes" />
      <Panel>
        <StatementTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.key}
          totalRow={{
            label: `Total of ${rows.length} stored ${rows.length === 1 ? 'purchase' : 'purchases'}`,
          }}
          label="Supplier fuel intakes"
        />
      </Panel>
    </section>
  );
};
