import React from 'react';
import { inr } from '../../utils/format.js';
import { legacyPurchases } from '../../services/reports/legacyPurchases.js';

/**
 * "Supplier Fuel Intakes" from an older Shift Summary snapshot. Purchases anchor
 * to the business day, never a Shift (ADR 0005, #308), so new snapshots hold
 * none and this renders nothing. Old snapshots are never recalculated, so the
 * purchases they stored keep showing.
 */
export const LegacyPurchasesTable: React.FC<{ snapshot: unknown }> = ({ snapshot }) => {
  const rows = legacyPurchases(snapshot);
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: '28px' }}>
      <h4
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}
      >
        Supplier Fuel Intakes
      </h4>
      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              borderBottom: '1px solid var(--border-strong)',
              textAlign: 'left',
              color: 'var(--text-muted)',
            }}
          >
            <th style={{ padding: '6px 8px' }}>Supplier</th>
            <th style={{ padding: '6px 8px' }}>Ref / Invoice</th>
            <th style={{ padding: '6px 8px' }}>Notes</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: any, idx: number) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{p.supplierName}</td>
              <td style={{ padding: '6px 8px', color: 'var(--text-default)' }}>
                {p.documentNumber} {p.invoiceNumber ? `(${p.invoiceNumber})` : ''}
              </td>
              <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{p.notes}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                {inr(p.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
