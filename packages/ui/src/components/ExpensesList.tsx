import React, { useEffect, useState } from 'react';
import { CloudTransactionService } from '../services/cloud.js';
import { Calendar, Receipt, DollarSign, ArrowRight } from 'lucide-react';

const transactionService = new CloudTransactionService();

export const ExpensesList: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await transactionService.getExpenses();
      setExpenses(list || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load expenses list');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading expenses tracker...
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
          Expenses Tracker
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
          Historical record of daily petty cash operational expenditures.
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
            Petty Cash Ledger
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Total Recorded Expenses: <strong>{expenses.length}</strong>
          </span>
        </div>

        {expenses.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No expenses recorded yet. Active operational shifts can record expenses.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-alt)', borderBottom: '1px solid var(--border-soft)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Shift Date</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Category</th>
                <th style={{ padding: '10px 20px', fontWeight: 600 }}>Description</th>
                <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '12px 20px', color: 'var(--text-default)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                      {new Date(e.shiftDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </div>
                  </td>
                  <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--text-strong)' }}>
                    {e.categoryName}
                  </td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>
                    {e.description || '--'}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: 'var(--brand-danger)', fontFamily: 'var(--font-mono)' }}>
                    ₹{Number(e.amount).toLocaleString('en-IN')}
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
