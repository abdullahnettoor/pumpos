import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { ExpenseEntryFormValues } from '@pump/shared';
import { canManageExpenseCategory } from '@pump/shared';
import { CloudTransactionService } from '../services/cloud.js';
import { Plus, Search, HelpCircle, Tags, Receipt, ArrowLeftRight } from 'lucide-react';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { Tabs } from './primitives/Tabs.js';
import { DateRangeField, computeRange } from './primitives/DateRangeField.js';
import type { DateRange } from './primitives/DateRangeField.js';
import { inr } from '../utils/format.js';
import { useToast } from './primitives/ToastProvider.js';
import { Drawer } from './Drawer.js';
import { ExpenseEntryForm } from './transactions/ExpenseEntryForm.js';
import { useExpenses, useShiftStatus, useExpenseCategories, useInvalidateOperational } from '../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { Panel, Button, KpiStrip, KpiTile, EmptyState } from '../pump-ds/index.js';
import type { NavIntent } from './AppShell.js';
import { expenseColumns } from './expenses/columns.js';
import { ExpenseAnalytics } from './expenses/ExpenseAnalytics.js';
import { CategoryManagerDrawer } from './expenses/CategoryManagerDrawer.js';

const transactionService = new CloudTransactionService();

type TabType = 'ledger' | 'analytics';

interface ExpensesListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
  userRole?: string;
  intent?: NavIntent | null;
  onIntentConsumed?: () => void;
}

const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <div style={{ position: 'relative' }}>
    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ height: '28px', padding: '0 8px 0 26px', width: '200px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)' }} />
  </div>
);

export const ExpensesList: React.FC<ExpensesListProps> = ({ selectedStation, defaultShiftId, userRole, intent, onIntentConsumed }) => {
  const stationId = selectedStation?.id ?? null;
  const expensesQ = useExpenses();
  const statusQ = useShiftStatus(stationId, true);
  const categoriesQ = useExpenseCategories();
  const invalidateOperational = useInvalidateOperational();
  const qc = useQueryClient();
  const toast = useToast();

  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };

  const expenses = expensesQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const activeShift = statusQ.data?.activeShift ?? null;
  const recentClosedShifts: any[] = statusQ.data?.recentClosedShifts ?? [];
  const canManageCategories = canManageExpenseCategory((userRole as any) ?? 'Staff');

  const [activeTab, setActiveTab] = useState<TabType>('ledger');
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');

  // Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [formDefaults, setFormDefaults] = useState<Partial<ExpenseEntryFormValues>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resolvePreferredShiftId = (active: any | null, closedList: any[]) => {
    if (defaultShiftId && (active?.id === defaultShiftId || closedList.some((sh) => sh.id === defaultShiftId))) return defaultShiftId;
    if (active) return active.id;
    if (closedList.length > 0) return closedList[0].id;
    return '';
  };
  const preferredShiftId = resolvePreferredShiftId(activeShift, recentClosedShifts);

  const openDrawer = () => {
    setFormError(null);
    setFormDefaults({
      categoryId: categories[0]?.id ?? '',
      targetShiftId: preferredShiftId,
      transactionDate: new Date().toISOString().slice(0, 10),
      amount: undefined as unknown as number,
      description: '',
    });
    setIsDrawerOpen(true);
  };
  const closeDrawer = () => setIsDrawerOpen(false);

  // Command-palette deep-link: open the entry drawer on arrival.
  const handledIntentRef = useRef<NavIntent | null>(null);
  useEffect(() => {
    if (!intent || handledIntentRef.current === intent) return;
    if (intent.open === 'new-expense') {
      handledIntentRef.current = intent;
      openDrawer();
      onIntentConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const handleAddExpense = async (values: ExpenseEntryFormValues) => {
    try {
      setSubmitting(true);
      setFormError(null);
      await transactionService.recordExpense({ stationId: stationId ?? undefined, transactionDate: values.transactionDate || undefined, paidFrom: 'BANK', categoryId: values.categoryId, amount: Number(values.amount), description: values.description || undefined, accountId: values.accountId || undefined });
      closeDrawer();
      invalidateOperational(stationId);
      toast.success('Expense recorded.');
    } catch (err: any) {
      setFormError(err.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const refetchCategories = () => qc.invalidateQueries({ queryKey: ['expense-categories'] });

  // KPIs — fixed windows (today / this month), independent of the table range filter.
  const kpis = useMemo(() => {
    const today = computeRange('today', clock);
    const month = computeRange('this-month', clock);
    const active = expenses.filter((e: any) => e.status !== 'VOIDED');
    const inWindow = (e: any, r: DateRange) => {
      const d = e.businessDate ?? e.shiftDate;
      return d && d >= r.from && d <= r.to;
    };
    const monthRows = active.filter((e: any) => inWindow(e, month));
    const spentToday = active.filter((e: any) => inWindow(e, today)).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const spentMonth = monthRows.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const drawerMonth = monthRows.filter((e: any) => e.paidFrom === 'SHIFT_CASH').reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const otherMonth = spentMonth - drawerMonth;
    return { spentToday, spentMonth, entriesMonth: monthRows.length, drawerMonth, otherMonth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, clock.timeZone, clock.dayStartsAt]);

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
        const d = e.businessDate ?? e.shiftDate;
        if (d && (d < range.from || d > range.to)) return false;
        return true;
      }),
    [expenses, selectedCategoryFilter, searchQuery, range.from, range.to],
  );

  if (!selectedStation) {
    return <div style={{ color: 'var(--text-muted)', padding: '24px' }}>Please select a station to view expenses.</div>;
  }

  return (
    <div className="animate-fade-in">
      <PageLayout
        title="Expenses"
        subtitle="Log and reconcile operational expenditure, and analyse spend by category."
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" leftIcon={<Tags />} onClick={() => setCategoryManagerOpen(true)}>Categories</Button>
            <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={openDrawer} disabled={categories.length === 0}>Add Expense</Button>
          </div>
        }
        toolbar={
          <Tabs
            variant="underline"
            aria-label="Expense views"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabType)}
            tabs={[
              { id: 'ledger', label: 'Ledger', icon: <Receipt size={15} /> },
              { id: 'analytics', label: 'By Category', icon: <ArrowLeftRight size={15} /> },
            ]}
          />
        }
      >
        {activeTab === 'ledger' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <KpiStrip columns="auto">
              <KpiTile dot="danger" valueTone="danger" label="Spent Today" value={inr(kpis.spentToday)} hint="business day" />
              <KpiTile dot="danger" valueTone="danger" label="Spent This Month" value={inr(kpis.spentMonth)} hint={`${kpis.entriesMonth} ${kpis.entriesMonth === 1 ? 'entry' : 'entries'}`} />
              <KpiTile dot="warning" label="From Cash Drawer" value={inr(kpis.drawerMonth)} hint="this month" />
              <KpiTile dot="info" label="From Bank / Owner" value={inr(kpis.otherMonth)} hint="this month" />
            </KpiStrip>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px' }}>
              <DateRangeField value={range} onChange={setRange} clock={clock} />
              <div style={{ flex: 1 }} />
              <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder="Search description / category…" />
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                style={{ height: '28px', padding: '0 8px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-strong)', fontSize: '12px', background: 'var(--bg-surface)', color: 'var(--text-default)' }}
              >
                <option value="">All categories</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                type="button"
                title="Business expenses post to the selected business day — no open shift required. Cash-drawer expenses are entered from the shift workspace so they reconcile against the drawer."
                aria-label="About expense anchoring"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', width: '28px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-soft)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'help' }}
              >
                <HelpCircle size={14} />
              </button>
            </div>

            <Panel flush title="Expense ledger">
              {expensesQ.isLoading ? (
                <div style={{ padding: '16px' }}><EmptyState compact icon={<Receipt />} title="Loading…" description="Fetching expenses." /></div>
              ) : filteredExpenses.length === 0 ? (
                <div style={{ padding: '12px' }}><EmptyState compact icon={<Receipt />} title={expenses.length === 0 ? 'No expenses yet' : 'No matches'} description={expenses.length === 0 ? 'Record your first expense with “Add Expense”.' : 'Adjust the range, search, or category filter.'} /></div>
              ) : (
                <DataTable
                  bare
                  columns={expenseColumns}
                  data={filteredExpenses}
                  error={expensesQ.error as Error | null}
                  emptyMessage="No matching expenses found."
                  getRowId={(r: any) => r.id}
                  initialSorting={[{ id: 'businessDate', desc: true }]}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'analytics' && <ExpenseAnalytics selectedStation={selectedStation} />}
      </PageLayout>

      <Drawer isOpen={isDrawerOpen} onClose={closeDrawer} title="Log New Expense">
        <ExpenseEntryForm
          shiftOptions={[]}
          categories={categories}
          stationId={stationId}
          defaultValues={formDefaults}
          showDateField
          dateLabel="Expense Date"
          showShiftHintWhenSingle={false}
          submitting={submitting}
          error={formError}
          submittingLabel="Recording..."
          amountLabel="Amount (₹)"
          descriptionPlaceholder="e.g. Bank charges, owner drawings, office supplies"
          onCancel={closeDrawer}
          onSubmit={handleAddExpense}
          submitLabel="Add Expense"
        />
      </Drawer>

      <CategoryManagerDrawer
        isOpen={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        categories={categories}
        onChanged={refetchCategories}
        canManage={canManageCategories}
      />
    </div>
  );
};
