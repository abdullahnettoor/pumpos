import React, { useCallback, useMemo, useState, useEffect } from 'react';
import type { ExpenseEntryFormValues } from '@pump/shared';
import { canManageExpenseCategory, canViewReports, canVoidExpense } from '@pump/shared';
import { CloudTransactionService } from '../services/cloud.js';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { DateRangeField, computeRange } from './primitives/DateRangeField.js';
import type { DateRange } from './primitives/DateRangeField.js';
import { inr } from '../utils/format.js';
import { useToast } from './primitives/ToastProvider.js';
import { useAsk } from './primitives/ConfirmDialog.js';
import { Drawer } from './Drawer.js';
import { ExpenseEntryForm } from './transactions/ExpenseEntryForm.js';
import { incomePayload } from '../utils/officeRecordPayloads.js';
import { useIncome, useIncomeCategories, useInvalidateOperational } from '../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import {
  Panel,
  Button,
  KpiStrip,
  KpiTile,
  EmptyState,
  SearchInput,
  Select,
  Icon,
} from '../pump-ds/index.js';
import { CategoryAnalytics } from './expenses/CategoryAnalytics.js';
import { IncomeGstPanel } from './reports/gst/IncomeGstPanel.js';
import { ROUTES } from '../nav-intent/routes.js';
import type { NavIntent } from '../nav-intent/store.js';
import { Tabs } from '../pump-ds/tabs/index.js';
import { buildIncomeColumns } from './income/columns.js';
import { IncomeCategoryManagerDrawer } from './income/IncomeCategoryManagerDrawer.js';
import { CASH_ACCOUNT_TYPES } from '../utils/ledgerLabels.js';
import { useRunTask } from '../utils/runTask.js';

const transactionService = new CloudTransactionService();

type IncomeTab = 'ledger' | 'analytics' | 'gst';

interface IncomeListProps {
  selectedStation: any | null;
  userRole?: string;
  /** Shell navigation, for the link to Reports → GST (income output GST lives there). */
  onNavigate?: (path: string, intent?: NavIntent) => void;
}

export const IncomeList: React.FC<IncomeListProps> = ({
  selectedStation,
  userRole,
  onNavigate,
}) => {
  const stationId = selectedStation?.id ?? null;
  const incomeQ = useIncome({ stationId: stationId ?? undefined });
  const categoriesQ = useIncomeCategories();
  const invalidateOperational = useInvalidateOperational();
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  const ask = useAsk();

  const s = selectedStation?.settings || {};
  const clock = useMemo(
    () => ({ timeZone: s.timezone, dayStartsAt: s.business_day_starts_at }),
    [s.timezone, s.business_day_starts_at],
  );
  // Office records are dated by entry date: the plain station calendar date (ADR 0005).
  const entryClock = useMemo(() => ({ timeZone: s.timezone }), [s.timezone]);

  const income = useMemo(() => incomeQ.data ?? [], [incomeQ.data]);
  const categories = categoriesQ.data ?? [];
  const canManageCategories = canManageExpenseCategory((userRole as any) ?? 'Staff');
  const canVoid = canVoidExpense((userRole as any) ?? 'Staff');

  const [activeTab, setActiveTab] = useState<IncomeTab>('ledger');
  /*
   * Income GST lives in Reports → GST (#540), but Reports is not every Income
   * role's page: Staff record income and always saw its output GST here. Roles
   * that can reach Reports get the link; the rest keep the view in place, so
   * the move changes where it is, never who sees it.
   */
  const reportsGst = canViewReports((userRole as any) ?? 'Staff');
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
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
      amount: undefined as unknown as number,
      description: '',
    });
    setIsDrawerOpen(true);
  };
  const closeDrawer = () => setIsDrawerOpen(false);

  const handleAddIncome = async (values: ExpenseEntryFormValues) => {
    try {
      setSubmitting(true);
      setFormError(null);
      if (!stationId) return;
      await transactionService.recordIncome(incomePayload(stationId, values));
      closeDrawer();
      toast.success('Income recorded.');
      await invalidateOperational(stationId);
    } catch (err: any) {
      setFormError(err.message || 'Failed to record income');
    } finally {
      setSubmitting(false);
    }
  };

  const refetchCategories = () => qc.invalidateQueries({ queryKey: ['income-categories'] });

  // Corrections are never edits: an income entry is voided (status → VOIDED) and
  // its ledger posting reversed, keeping history append-only.
  const handleVoid = useCallback(
    async (row: any) => {
      const { confirmed, value } = await ask({
        title: 'Void this income entry?',
        message: (
          <>
            {inr(row.amount)} · {row.categoryName || 'Other Income'}. The entry stays in the ledger
            marked
            <strong> Voided</strong> and its money posting is reversed. This cannot be undone.
          </>
        ),
        input: { label: 'Reason (optional)', placeholder: 'e.g. duplicate entry, wrong amount' },
        confirmLabel: 'Void income',
        danger: true,
      });
      if (!confirmed) return;
      try {
        await transactionService.voidIncome(row.id, value);
        toast.success('Income voided.');
        await invalidateOperational(stationId);
      } catch (err: any) {
        toast.error(err.message || 'Failed to void income');
      }
    },
    [ask, invalidateOperational, stationId, toast],
  );

  const ledgerColumns = useMemo(
    () =>
      buildIncomeColumns(
        canVoid ? (row) => runTask(handleVoid(row), 'Could not void the income entry.') : undefined,
      ),
    [canVoid, handleVoid, runTask],
  );

  // KPIs — fixed windows (today / this month), independent of the table range filter.
  const kpis = useMemo(() => {
    const today = computeRange('today', entryClock);
    const month = computeRange('this-month', entryClock);
    const active = income.filter((e: any) => e.status !== 'VOIDED');
    const inWindow = (e: any, r: DateRange) => {
      const d = e.entryDate;
      return d && d >= r.from && d <= r.to;
    };
    const monthRows = active.filter((e: any) => inWindow(e, month));
    const todayTotal = active
      .filter((e: any) => inWindow(e, today))
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const monthTotal = monthRows.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const cashMonth = monthRows
      .filter((e: any) => CASH_ACCOUNT_TYPES.includes(e.accountType))
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const otherMonth = monthTotal - cashMonth;
    return { todayTotal, monthTotal, entriesMonth: monthRows.length, cashMonth, otherMonth };
  }, [income, entryClock]);

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
        const d = e.entryDate;
        if (d && (d < range.from || d > range.to)) return false;
        return true;
      }),
    [income, selectedCategoryFilter, searchQuery, range.from, range.to],
  );

  if (!selectedStation) {
    return (
      <div style={{ color: 'var(--text-muted)', padding: '24px' }}>
        Please select a station to view income.
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageLayout
        title="Income"
        subtitle="Record indirect / other income — rentals, commissions, scrap, interest — and reconcile it into cash, bank or owner."
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {reportsGst && onNavigate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onNavigate(ROUTES.reports, { openReportsTab: 'gst', openGstView: 'income' })
                }
              >
                GST in Reports ›
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Icon name="tags" size="sm" />}
              onClick={() => setCategoryManagerOpen(true)}
            >
              Categories
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Icon name="plus" size="sm" />}
              onClick={openDrawer}
              disabled={categories.length === 0}
            >
              Add Income
            </Button>
          </div>
        }
        toolbar={
          <Tabs
            aria-label="Income"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as IncomeTab)}
            tabs={[
              { id: 'ledger', label: 'Income', concept: 'income' },
              {
                id: 'analytics',
                label: 'By category',
                concept: 'by-category',
              },
              ...(reportsGst ? [] : [{ id: 'gst', label: 'GST', concept: 'gst' as const }]),
            ]}
          />
        }
      >
        {activeTab === 'ledger' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <KpiStrip columns="auto">
              <KpiTile
                dot="success"
                valueTone="success"
                label="Received Today"
                value={inr(kpis.todayTotal)}
                hint="entry date"
              />
              <KpiTile
                dot="success"
                valueTone="success"
                label="Received This Month"
                value={inr(kpis.monthTotal)}
                hint={`${kpis.entriesMonth} ${kpis.entriesMonth === 1 ? 'entry' : 'entries'}`}
              />
              <KpiTile
                dot="warning"
                label="Into Cash in Hand / Petty"
                value={inr(kpis.cashMonth)}
                hint="this month"
              />
              <KpiTile
                dot="info"
                label="Into Bank / Owner"
                value={inr(kpis.otherMonth)}
                hint="this month"
              />
            </KpiStrip>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px' }}>
              <DateRangeField value={range} onChange={setRange} clock={entryClock} size="sm" />
              <div style={{ flex: 1 }} />
              <SearchInput
                inputSize="sm"
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search description / category…"
                style={{ width: '220px' }}
              />
              <div style={{ width: '190px' }}>
                <Select
                  inputSize="sm"
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  aria-label="Filter by category"
                >
                  <option value="">All categories</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                title="Income is an office record: dated by entry date and received into the chosen account. It never touches a shift drawer."
                aria-label="About income anchoring"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '28px',
                  width: '28px',
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--border-soft)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-muted)',
                  cursor: 'help',
                }}
              >
                <Icon name="help" size="xs" />
              </button>
            </div>

            <Panel flush title="Income ledger">
              {incomeQ.isLoading ? (
                <div style={{ padding: '16px' }}>
                  <EmptyState
                    compact
                    icon={<Icon name="cash" size="md" />}
                    title="Loading…"
                    description="Fetching income."
                  />
                </div>
              ) : filteredIncome.length === 0 ? (
                <div style={{ padding: '12px' }}>
                  <EmptyState
                    compact
                    icon={<Icon name="cash" size="md" />}
                    title={income.length === 0 ? 'No income yet' : 'No matches'}
                    description={
                      income.length === 0
                        ? 'Record your first income with “Add Income”.'
                        : 'Adjust the range, search, or category filter.'
                    }
                  />
                </div>
              ) : (
                <DataTable
                  bare
                  columns={ledgerColumns}
                  data={filteredIncome}
                  error={incomeQ.error}
                  title="income"
                  onRetry={incomeQ.refetch}
                  emptyMessage="No matching income found."
                  getRowId={(r: any) => r.id}
                  initialSorting={[{ id: 'entryDate', desc: true }]}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'analytics' && (
          <CategoryAnalytics selectedStation={selectedStation} kind="income" />
        )}

        {activeTab === 'gst' && !reportsGst && <IncomeGstPanel selectedStation={selectedStation} />}
      </PageLayout>

      <Drawer isOpen={isDrawerOpen} onClose={closeDrawer} title="Record Income">
        <ExpenseEntryForm
          categories={categories}
          stationId={stationId}
          timeZone={clock.timeZone}
          defaultValues={formDefaults}
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
