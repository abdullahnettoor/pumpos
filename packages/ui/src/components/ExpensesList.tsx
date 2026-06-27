import React, { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CloudTransactionService } from '../services/cloud.js';
import { Calendar, Plus, Info } from 'lucide-react';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { Drawer } from './Drawer.js';
import { ExpenseEntryForm } from './transactions/ExpenseEntryForm.js';
import { useExpenses, useShiftStatus, useExpenseCategories, useInvalidateOperational } from '../query/hooks.js';

const transactionService = new CloudTransactionService();

interface ExpensesListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
}

const expenseColumns: ColumnDef<any, any>[] = [
  {
    accessorKey: 'businessDate',
    header: 'Business Day',
    cell: ({ row }) => {
      const d = row.original.businessDate ?? row.original.shiftDate;
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-default)' }}>
          <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
          {d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
        </span>
      );
    },
  },
  { accessorKey: 'categoryName', header: 'Category', cell: ({ getValue }) => <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{(getValue() as string) ?? 'General'}</span> },
  { accessorKey: 'description', header: 'Description', cell: ({ getValue }) => <span style={{ color: 'var(--text-muted)' }}>{(getValue() as string) || '—'}</span> },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ getValue }) => (
      <span style={{ fontWeight: 700, color: 'var(--brand-danger)', fontFamily: 'var(--font-mono)' }}>
        ₹{Number(getValue()).toLocaleString('en-IN')}
      </span>
    ),
  },
];

export const ExpensesList: React.FC<ExpensesListProps> = ({ selectedStation, defaultShiftId }) => {
  const stationId = selectedStation?.id ?? null;
  const expensesQ = useExpenses();
  const statusQ = useShiftStatus(stationId, true);
  const categoriesQ = useExpenseCategories();
  const invalidateOperational = useInvalidateOperational();

  const expenses = expensesQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const activeShift = statusQ.data?.activeShift ?? null;
  const recentClosedShifts: any[] = statusQ.data?.recentClosedShifts ?? [];

  const resolvePreferredShiftId = (active: any | null, closedList: any[]) => {
    if (defaultShiftId && (active?.id === defaultShiftId || closedList.some((s) => s.id === defaultShiftId))) return defaultShiftId;
    if (active) return active.id;
    if (closedList.length > 0) return closedList[0].id;
    return '';
  };
  const preferredShiftId = resolvePreferredShiftId(activeShift, recentClosedShifts);

  // Drawer + form
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [targetShiftId, setTargetShiftId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filters
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const openDrawer = () => {
    setFormError(null);
    setCategoryId(categories[0]?.id ?? '');
    setAmount('');
    setDescription('');
    setTargetShiftId(preferredShiftId);
    setIsDrawerOpen(true);
  };
  const closeDrawer = () => setIsDrawerOpen(false);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetShiftId || !categoryId || !amount) return;
    try {
      setSubmitting(true);
      setFormError(null);
      await transactionService.recordExpense({ shiftId: targetShiftId, categoryId, amount: Number(amount), description: description || undefined });
      closeDrawer();
      invalidateOperational(stationId);
    } catch (err: any) {
      setFormError(err.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e: any) => {
        if (selectedCategoryFilter && e.categoryId !== selectedCategoryFilter) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const descMatch = e.description ? e.description.toLowerCase().includes(q) : false;
          const catMatch = e.categoryName ? e.categoryName.toLowerCase().includes(q) : false;
          if (!descMatch && !catMatch) return false;
        }
        const dateStr = e.businessDate ?? e.shiftDate;
        if ((startDate || endDate) && dateStr) {
          const date = new Date(dateStr);
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
      }),
    [expenses, selectedCategoryFilter, searchQuery, startDate, endDate],
  );

  if (!selectedStation) {
    return <div style={{ color: 'var(--text-muted)', padding: '24px' }}>Please select a station to view expenses.</div>;
  }

  return (
    <div className="animate-fade-in">
      <PageLayout
        title="Expenses Tracker"
        subtitle="Log and reconcile daily petty cash operational expenditures."
        actions={
          <button className="btn btn-primary btn-md" onClick={openDrawer} disabled={!preferredShiftId}>
            <Plus size={14} /> Add Expense
          </button>
        }
        toolbar={
          <>
            {preferredShiftId ? (
              <div style={{ backgroundColor: 'var(--state-info-bg)', color: 'var(--state-info-fg)', padding: '8px 12px', borderRadius: 'var(--radius-card)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border-soft)', width: '100%' }}>
                <Info size={14} />
                <span>
                  New expenses post to{' '}
                  <strong>{preferredShiftId === activeShift?.id ? `${activeShift?.templateName} (Active)` : recentClosedShifts.find((s) => s.id === preferredShiftId)?.templateName ?? 'selected shift'}</strong>.
                </span>
              </div>
            ) : (
              <div style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', padding: '10px 12px', borderRadius: 'var(--radius-card)', fontSize: '12px', border: '1px solid var(--border-soft)', width: '100%' }}>
                <strong>Shift-gated:</strong> open an operational shift before entering expenses.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '12px', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label className="field-label">Search</label>
                <input type="text" className="input input-compact" placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label className="field-label">Category</label>
                <select className="select input-compact" value={selectedCategoryFilter} onChange={(e) => setSelectedCategoryFilter(e.target.value)}>
                  <option value="">All Categories</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label className="field-label">Start Date</label>
                <input type="date" className="input input-compact" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label className="field-label">End Date</label>
                <input type="date" className="input input-compact" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </>
        }
      >
        <DataTable
          columns={expenseColumns}
          data={filteredExpenses}
          isLoading={expensesQ.isLoading}
          error={expensesQ.error as Error | null}
          emptyMessage="No matching expenses found."
          getRowId={(r: any) => r.id}
          initialSorting={[{ id: 'businessDate', desc: true }]}
        />
      </PageLayout>

      <Drawer isOpen={isDrawerOpen} onClose={closeDrawer} title="Log New Expense">
        {preferredShiftId ? (
          <ExpenseEntryForm
            shiftOptions={[
              ...(activeShift ? [{ id: activeShift.id, label: `Active: ${activeShift.templateName} (Open)` }] : []),
              ...recentClosedShifts.map((shift) => ({
                id: shift.id,
                label: `Closed: ${shift.templateName} (${new Date(shift.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})`,
              })),
            ]}
            targetShiftId={targetShiftId}
            onTargetShiftIdChange={setTargetShiftId}
            categoryId={categoryId}
            onCategoryIdChange={setCategoryId}
            categories={categories}
            amount={amount}
            onAmountChange={setAmount}
            description={description}
            onDescriptionChange={setDescription}
            submitting={submitting}
            error={formError}
            submittingLabel="Recording..."
            submitDisabled={submitting || !amount || !categoryId}
            amountLabel="Amount (₹)"
            descriptionPlaceholder="e.g. Staff tea and refreshments"
            onCancel={closeDrawer}
            onSubmit={handleAddExpense}
            submitLabel="Add Expense"
          />
        ) : (
          <div style={{ backgroundColor: 'var(--state-warning-bg)', color: 'var(--state-warning-fg)', padding: '16px', borderRadius: 'var(--radius-input)', fontSize: '13px', border: '1px solid var(--border-soft)', lineHeight: '1.5' }}>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: '4px' }}>Shift Gated Action</span>
            Petty expenses must be linked to a shift. Open an active operational shift before entering expenses.
          </div>
        )}
      </Drawer>
    </div>
  );
};
