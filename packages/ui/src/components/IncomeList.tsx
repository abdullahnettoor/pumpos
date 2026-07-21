import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { ExpenseEntryFormValues } from '@pump/shared';
import { canManageExpenseCategory } from '@pump/shared';
import { CloudTransactionService } from '../services/cloud.js';
import { Plus, HelpCircle, Tags, Banknote } from 'lucide-react';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { DateRangeField, computeRange } from './primitives/DateRangeField.js';
import type { DateRange } from './primitives/DateRangeField.js';
import { inr } from '../utils/format.js';
import { useToast } from './primitives/ToastProvider.js';
import { Drawer } from './Drawer.js';
import { ExpenseEntryForm } from './transactions/ExpenseEntryForm.js';
import { useIncome, useIncomeCategories, useInvalidateOperational } from '../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import { Panel, Button, KpiStrip, KpiTile, EmptyState, SearchInput, Select } from '../pump-ds/index.js';
import type { NavIntent } from './AppShell.js';
import { incomeColumns } from './income/columns.js';
import { IncomeCategoryManagerDrawer } from './income/IncomeCategoryManagerDrawer.js';

const transactionService = new CloudTransactionService();

interface IncomeListProps {
  selectedStation: any | null;
  userRole?: string;
  intent?: NavIntent | null;
  onIntentConsumed?: () => void;
}

export const IncomeList: React.FC<IncomeListProps> = ({ selectedStation, userRole, intent, onIntentConsumed }) => {
  const stationId = selectedStation?.id ?? null;
  const incomeQ = useIncome({ stationId: stationId ?? undefined });
  const categoriesQ = useIncomeCategories();
  const invalidateOperational = useInvalidateOperational();
  const qc = useQueryClient();
  const toast = useToast();

  const s = (selectedStation as any)?.settings || {};
  const clock = { timeZone: s.timezone, dayStartsAt: s.business_day_starts_at };

  const income = incomeQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const canManageCategories = canManageExpenseCategory((userRole as any) ?? 'Staff');

  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', clock));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');

  // Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [formDefaults, setFormDefaults] = useState<Partial<ExpenseEntryFormValues>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openDrawer = () => {
    setFormError(null);
    setFormDefaults({
      categoryId: categories[0]?.id ?? '',
      targetShiftId: '',
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
    if (intent.open === 'new-income') {
      handledIntentRef.current = intent;
      openDrawer();
      onIntentConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const handleAddIncome = async (values: ExpenseEntryFormValues) => {
    try {
      setSubmitting(true);
      setFormError(null);
      await transactionService.recordIncome({ stationId: stationId ?? undefined, transactionDate: values.transactionDate || undefined, receivedInto: 'BANK', categoryId: values.categoryId, amount: Number(values.amount), description: values.description || undefined, accountId: values.accountId || undefined });
      closeDrawer();
      invalidateOperational(stationId);
      toast.success('Income recorded.');
    } catch (err: any) {
      setFormError(err.message || 'Failed to record income');
    } finally {
      setSubmitting(false);
    }
  };

  const refetchCategories = () => qc.invalidateQueries({ queryKey: ['income-categories'] });

  // KPIs — fixed windows (today / this month), independent of the table range filter.
  const kpis = useMemo(() => {
    const today = computeRange('today', clock);
    const month = computeRange('this-month', clock);
    const active = income.filter((e: any) => e.status !== 'VOIDED');
    const inWindow = (e: any, r: DateRange) => {
      const d = e.businessDate ?? e.shiftDate;
      return d && d >= r.from && d <= r.to;
    };
    const monthRows = active.filter((e: any) => inWindow(e, month));
    const todayTotal = active.filter((e: any) => inWindow(e, today)).reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const monthTotal = monthRows.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const drawerMonth = monthRows.filter((e: any) => e.receivedInto === 'SHIFT_CASH').reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const otherMonth = monthTotal - drawerMonth;
    return { todayTotal, monthTotal, entriesMonth: monthRows.length, drawerMonth, otherMonth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, clock.timeZone, clock.dayStartsAt]);

  const filteredIncome = useMemo(
    () =>
      income.filter((e: any) => {
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
    [income, selectedCategoryFilter, searchQuery, range.from, range.to],
  );

  if (!selectedStation) {
    return <div style={{ color: 'var(--text-muted)', padding: '24px' }}>Please select a station to view income.</div>;
  }

  return (
    <div className="animate-fade-in">
      <PageLayout
        title="Income"
        subtitle="Record indirect / other income — rentals, commissions, scrap, interest — and reconcile it into cash, bank or owner."
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" leftIcon={<Tags />} onClick={() => setCategoryManagerOpen(true)}>Categories</Button>
            <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={openDrawer} disabled={categories.length === 0}>Add Income</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <KpiStrip columns="auto">
            <KpiTile dot="success" valueTone="success" label="Received Today" value={inr(kpis.todayTotal)} hint="business day" />
            <KpiTile dot="success" valueTone="success" label="Received This Month" value={inr(kpis.monthTotal)} hint={`${kpis.entriesMonth} ${kpis.entriesMonth === 1 ? 'entry' : 'entries'}`} />
            <KpiTile dot="warning" label="Into Cash Drawer" value={inr(kpis.drawerMonth)} hint="this month" />
            <KpiTile dot="info" label="Into Bank / Owner" value={inr(kpis.otherMonth)} hint="this month" />
          </KpiStrip>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px' }}>
            <DateRangeField value={range} onChange={setRange} clock={clock} size="sm" />
            <div style={{ flex: 1 }} />
            <SearchInput inputSize="sm" value={searchQuery} onChange={setSearchQuery} placeholder="Search description / category…" style={{ width: '220px' }} />
            <div style={{ width: '190px' }}>
              <Select inputSize="sm" value={selectedCategoryFilter} onChange={(e) => setSelectedCategoryFilter(e.target.value)} aria-label="Filter by category">
                <option value="">All categories</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <button
              type="button"
              title="Other income posts to the selected business day — no open shift required. Cash income entered from the shift workspace reconciles into the drawer."
              aria-label="About income anchoring"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: '28px', width: '28px', borderRadius: 'var(--radius-input)', border: '1px solid var(--border-soft)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'help' }}
            >
              <HelpCircle size={14} />
            </button>
          </div>

          <Panel flush title="Income ledger">
            {incomeQ.isLoading ? (
              <div style={{ padding: '16px' }}><EmptyState compact icon={<Banknote />} title="Loading…" description="Fetching income." /></div>
            ) : filteredIncome.length === 0 ? (
              <div style={{ padding: '12px' }}><EmptyState compact icon={<Banknote />} title={income.length === 0 ? 'No income yet' : 'No matches'} description={income.length === 0 ? 'Record your first income with “Add Income”.' : 'Adjust the range, search, or category filter.'} /></div>
            ) : (
              <DataTable
                bare
                columns={incomeColumns}
                data={filteredIncome}
                error={incomeQ.error as Error | null}
                emptyMessage="No matching income found."
                getRowId={(r: any) => r.id}
                initialSorting={[{ id: 'businessDate', desc: true }]}
              />
            )}
          </Panel>
        </div>
      </PageLayout>

      <Drawer isOpen={isDrawerOpen} onClose={closeDrawer} title="Record Income">
        <ExpenseEntryForm
          shiftOptions={[]}
          categories={categories}
          stationId={stationId}
          defaultValues={formDefaults}
          showDateField
          dateLabel="Income Date"
          showShiftHintWhenSingle={false}
          submitting={submitting}
          error={formError}
          submittingLabel="Recording..."
          amountLabel="Amount (₹)"
          categoryLabel="Income Category"
          categoryEmptyMessage="No income categories yet — add one with “Categories”."
          accountLabel="Received into"
          descriptionPlaceholder="e.g. Tanker rental, scrap sale, commission"
          onCancel={closeDrawer}
          onSubmit={handleAddIncome}
          submitLabel="Add Income"
        />
      </Drawer>

      <IncomeCategoryManagerDrawer
        isOpen={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        categories={categories}
        onChanged={refetchCategories}
        canManage={canManageCategories}
      />
    </div>
  );
};
