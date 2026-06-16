import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { User, ShieldAlert, CreditCard, DollarSign } from 'lucide-react';

const transactionService = new CloudTransactionService();

export const CustomersList: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await transactionService.getCustomers();
      setCustomers(list || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load customers list');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading customer registries...
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
          Customer Credit Accounts
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
          Manage fleet customer profiles, credit allocations, and outstanding ledger balances.
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
            Credit Accounts Registry
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Active Accounts: <strong>{customers.length}</strong>
          </span>
        </div>

        {customers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No customer accounts configured yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Customer Name</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Account Type</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Credit Limit</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Outstanding Balance</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, idx) => {
                const balance = Number(c.currentBalance || 0);
                const limit = Number(c.creditLimit || 50000);
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User size={14} style={{ color: 'var(--text-muted)' }} />
                        {c.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: c.customerType === 'Fleet' ? 'var(--state-info-bg)' : 'var(--bg-surface-alt)',
                        color: c.customerType === 'Fleet' ? 'var(--state-info-fg)' : 'var(--text-strong)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-chip)'
                      }}>
                        {c.customerType}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      ₹{limit.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: c.isActive ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
                        color: c.isActive ? 'var(--state-success-fg)' : 'var(--state-danger-fg)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-chip)'
                      }}>
                        {c.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: balance > 0 ? 'var(--brand-warning)' : 'var(--state-success-fg)', fontFamily: 'var(--font-mono)' }}>
                      ₹{balance.toLocaleString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
