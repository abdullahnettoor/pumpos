import React, { useEffect, useState } from 'react';
import { CloudTransactionService, CloudShiftService } from '../services/cloud.js';
import { Calendar, Plus, Coins, Info } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Drawer } from './Drawer.js';

const transactionService = new CloudTransactionService();
const shiftService = new CloudShiftService();

interface ExpensesListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
}

export const ExpensesList: React.FC<ExpensesListProps> = ({ selectedStation, defaultShiftId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [recentClosedShifts, setRecentClosedShifts] = useState<any[]>([]);
  const [targetShiftId, setTargetShiftId] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Form States
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filter States
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (selectedStation) {
      loadData();
    }
  }, [selectedStation]);

  const resolvePreferredShiftId = (active: any | null, closedList: any[]) => {
    if (defaultShiftId) {
      const matchesActive = active?.id === defaultShiftId;
      const matchesClosed = closedList.some((shift) => shift.id === defaultShiftId);

      if (matchesActive || matchesClosed) {
        return defaultShiftId;
      }
    }

    if (active) {
      return active.id;
    }

    if (closedList.length > 0) {
      return closedList[0].id;
    }

    return '';
  };

  const resetForm = (nextTargetShiftId?: string) => {
    setCategoryId(categories[0]?.id ?? '');
    setAmount('');
    setDescription('');
    setTargetShiftId(nextTargetShiftId ?? resolvePreferredShiftId(activeShift, recentClosedShifts));
  };

  const openDrawer = () => {
    resetForm();
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    resetForm();
    setIsDrawerOpen(false);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch active shift status and historical expenses
      const [list, status, cats] = await Promise.all([
        transactionService.getExpenses(),
        shiftService.getShiftStatus(selectedStation.id, true),
        transactionService.getExpenseCategories()
      ]);

      setExpenses(list || []);
      const active = status.activeShift || null;
      const closedList = status.recentClosedShifts || [];
      setActiveShift(active);
      setRecentClosedShifts(closedList);
      setCategories(cats || []);

      setCategoryId(cats?.[0]?.id ?? '');
      setTargetShiftId(resolvePreferredShiftId(active, closedList));
    } catch (err: any) {
      setError(err.message || 'Failed to load expenses data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetShiftId || !categoryId || !amount) return;

    try {
      setSubmitting(true);
      await transactionService.recordExpense({
        shiftId: targetShiftId,
        categoryId,
        amount: Number(amount),
        description: description || undefined,
      });

      closeDrawer();
      const updatedList = await transactionService.getExpenses();
      setExpenses(updatedList || []);
    } catch (err: any) {
      alert(err.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    if (selectedCategoryFilter && e.categoryId !== selectedCategoryFilter) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const descMatch = e.description ? e.description.toLowerCase().includes(q) : false;
      const catMatch = e.categoryName ? e.categoryName.toLowerCase().includes(q) : false;
      if (!descMatch && !catMatch) return false;
    }
    if (startDate || endDate) {
      const date = new Date(e.shiftDate);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (date < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (date > end) return false;
      }
    }
    return true;
  });

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view expenses.
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner text="Loading expenses registry..." />;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-strong)' }}>
            Expenses Tracker
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Log and reconcile daily petty cash operational expenditures.
          </p>
        </div>

        <button
          type="button"
          onClick={openDrawer}
          disabled={!targetShiftId}
          style={{
            height: '36px',
            padding: '0 14px',
            backgroundColor: targetShiftId ? 'var(--brand-primary)' : 'var(--border-strong)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--radius-button)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: targetShiftId ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          <Plus size={14} /> Add Expense
        </button>
      </div>

      {targetShiftId ? (
        <div style={{
          backgroundColor: 'var(--state-info-bg)',
          color: 'var(--state-info-fg)',
          padding: '12px 14px',
          borderRadius: 'var(--radius-card)',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          border: '1px solid var(--border-soft)'
        }}>
          <Info size={14} />
          <span>
            Expense entries will post to{' '}
            <strong>
              {targetShiftId === activeShift?.id
                ? `${activeShift?.templateName} (Active)`
                : recentClosedShifts.find((shift) => shift.id === targetShiftId)?.templateName ?? 'selected shift'}
            </strong>
            {defaultShiftId === targetShiftId ? ' from the current context.' : '.'}
          </span>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--state-warning-bg)',
          color: 'var(--state-warning-fg)',
          padding: '16px',
          borderRadius: 'var(--radius-card)',
          fontSize: '13px',
          border: '1px solid var(--border-soft)',
          lineHeight: '1.5'
        }}>
          <span style={{ fontWeight: 700, display: 'block', marginBottom: '4px' }}>Shift Gated Action</span>
          Petty expenses must be linked to a shift. Please open an active operational shift on the dashboard or shifts management page before entering expenses.
        </div>
      )}

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
              Showing: <strong>{filteredExpenses.length}</strong> of {expenses.length}
            </span>
          </div>

          {/* Filter Bar */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border-soft)',
            backgroundColor: 'var(--bg-surface-alt)',
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr 1fr',
            gap: '12px',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>Search description</label>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  height: '28px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>Category</label>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                style={{
                  height: '28px',
                  padding: '0 6px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-surface)'
                }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  height: '28px',
                  padding: '0 6px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '12px',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  height: '28px',
                  padding: '0 6px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '12px',
                }}
              />
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No matching expenses found.
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
                {filteredExpenses.map((e, idx) => (
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

      <Drawer
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        title="Log New Expense"
      >
        {targetShiftId ? (
          <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {(activeShift && recentClosedShifts.length > 0) || recentClosedShifts.length > 1 ? (
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Target Shift</label>
                <select
                  value={targetShiftId}
                  onChange={(e) => setTargetShiftId(e.target.value)}
                  disabled={submitting}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--border-strong)',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-surface)'
                  }}
                >
                  {activeShift && (
                    <option value={activeShift.id}>Active: {activeShift.templateName} (Open)</option>
                  )}
                  {recentClosedShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      Closed: {s.templateName} ({new Date(s.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{
                backgroundColor: 'var(--state-info-bg)',
                color: 'var(--state-info-fg)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-input)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Info size={14} />
                <span>
                  Logging to {activeShift ? 'active' : 'previous closed'} shift:{' '}
                  <strong>{targetShiftId === activeShift?.id ? activeShift?.templateName : recentClosedShifts[0]?.templateName}</strong>
                </span>
              </div>
            )}

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={submitting}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Amount (₹)</label>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
                required
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Description</label>
              <input
                type="text"
                placeholder="snacks, stationery, printer ink..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                style={{
                  height: '32px',
                  padding: '0 8px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={closeDrawer}
                disabled={submitting}
                style={{
                  flex: 1,
                  height: '36px',
                  backgroundColor: 'var(--bg-surface-alt)',
                  color: 'var(--text-default)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: submitting ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !amount}
                style={{
                  flex: 1,
                  height: '36px',
                  backgroundColor: 'var(--brand-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Plus size={14} /> {submitting ? 'Recording...' : 'Add Expense'}
              </button>
            </div>
          </form>
        ) : (
          <div style={{
            backgroundColor: 'var(--state-warning-bg)',
            color: 'var(--state-warning-fg)',
            padding: '16px',
            borderRadius: 'var(--radius-input)',
            fontSize: '13px',
            border: '1px solid var(--border-soft)',
            lineHeight: '1.5'
          }}>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: '4px' }}>Shift Gated Action</span>
            Petty expenses must be linked to a shift. Please open an active operational shift on the dashboard or shifts management page before entering expenses.
          </div>
        )}
      </Drawer>
    </div>
  );
};
