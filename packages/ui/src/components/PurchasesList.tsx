import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { Calendar, ShoppingCart, Info } from 'lucide-react';

const transactionService = new CloudTransactionService();

export const PurchasesList: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<any[]>([]);

  useEffect(() => {
    loadPurchases();
  }, []);

  const loadPurchases = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await transactionService.getPurchases();
      setPurchases(list || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchases list');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading supplier purchases...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', backgroundColor: 'var(--state-danger-bg)', color: 'var(--state-danger-fg)', borderRadius: 'var(--radius-card)' }}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-sans)' }}>
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
          Supplier Purchases
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
          Historical record of fuel drop deliveries and inventory replenishments.
        </p>
      </div>

      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Fuel Intake Registry
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Total Invoices Logged: <strong>{purchases.length}</strong>
          </span>
        </div>

        {purchases.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No purchases logged yet. Log tanker deliveries during active shifts.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Shift Date</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Supplier</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Reference Code</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Invoice Number</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Notes</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                      {new Date(p.shiftDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </div>
                  </td>
                  <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                    {p.supplierName}
                  </td>
                  <td style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', color: 'var(--text-default)' }}>
                    {p.documentNumber}
                  </td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-strong)' }}>
                    {p.invoiceNumber || '--'}
                  </td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                    {p.notes || '--'}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)' }}>
                    ₹{Number(p.amount).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
