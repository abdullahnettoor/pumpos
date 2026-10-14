import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { canManageExpenseCategory, canVoidExpense } from '@pump/shared';
import { CloudTransactionService } from '../../services/cloud.js';
import { ROUTES, type RoutePath } from '../../nav-intent/routes.js';
import {
  queryKeys,
  useExpenseCategories,
  useExpenses,
  useIncome,
  useIncomeCategories,
  useInvalidateOperational,
} from '../../query/hooks.js';
import { openQuickEntry } from '../../quick-entry/store.js';
import {
  Button,
  DataSection,
  EmptyState,
  Icon,
  InteractiveTable,
  KpiStrip,
  KpiTile,
  SearchInput,
  SectionHeader,
  Select,
  Tabs,
  tabPanelProps,
  type IconName,
  type TabItem,
  type TotalRow,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { CASH_ACCOUNT_TYPES } from '../../utils/ledgerLabels.js';
import { useRunTask } from '../../utils/runTask.js';
import { PageFrame } from '../page-frame/index.js';
import { DateRangeField, computeRange, type DateRange } from '../primitives/DateRangeField.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { useAsk } from '../primitives/ConfirmDialog.js';
import { useToast } from '../primitives/ToastProvider.js';
import { CategoryAnalytics } from '../expenses/CategoryAnalytics.js';
import { CategoryManagerDrawer, type CategoryRecordKind } from './CategoryManagerDrawer.js';
import {
  FALLBACK_CATEGORY,
  buildCategoryRecordColumns,
  isVoided,
  type CategoryRecord,
} from './categoryRecordColumns.js';

const transactionService = new CloudTransactionService();

interface KpiCopy {
  label: string;
  dot: 'danger' | 'success' | 'warning' | 'info';
  tone?: 'danger' | 'success';
}

/** Everything that differs between the Expenses and Income pages. */
const COPY: Record<
  CategoryRecordKind,
  {
    route: RoutePath;
    subtitle: string;
    tabsLabel: string;
    ledgerTab: TabItem;
    noun: string;
    ledger: string;
    record: string;
    icon: IconName;
    kpis: [KpiCopy, KpiCopy, KpiCopy, KpiCopy];
    about: string;
    void: { title: string; confirm: string; done: string; failed: string; task: string };
  }
> = {
  expense: {
    route: ROUTES.expenses,
    subtitle: 'Log and reconcile operational expenditure, and analyse spend by category.',
    tabsLabel: 'Expense views',
    ledgerTab: { id: 'ledger', label: 'Expenses', concept: 'expenses' },
    noun: 'expenses',
    ledger: 'Expense ledger',
    record: 'Record expense',
    icon: 'receipt',
    kpis: [
      { label: 'Spent Today', dot: 'danger', tone: 'danger' },
      { label: 'Spent This Month', dot: 'danger', tone: 'danger' },
      { label: 'Cash in Hand / Petty', dot: 'warning' },
      { label: 'From Bank / Owner', dot: 'info' },
    ],
    about:
      'Expenses are office records: dated by entry date and paid from the chosen account. They never touch a shift drawer.',
    void: {
      title: 'Void this expense?',
      confirm: 'Void expense',
      done: 'Expense voided.',
      failed: 'Failed to void expense',
      task: 'Could not void the expense.',
    },
  },
  income: {
    route: ROUTES.income,
    subtitle:
      'Record indirect / other income — rentals, commissions, scrap, interest — and reconcile it into cash, bank or owner.',
    tabsLabel: 'Income',
    ledgerTab: { id: 'ledger', label: 'Income', concept: 'income' },
    noun: 'income',
    ledger: 'Income ledger',
    record: 'Record income',
    icon: 'cash',
    kpis: [
      { label: 'Received Today', dot: 'success', tone: 'success' },
      { label: 'Received This Month', dot: 'success', tone: 'success' },
      { label: 'Into Cash in Hand / Petty', dot: 'warning' },
      { label: 'Into Bank / Owner', dot: 'info' },
    ],
    about:
      'Income is an office record: dated by entry date and received into the chosen account. It never touches a shift drawer.',
    void: {
      title: 'Void this income entry?',
      confirm: 'Void income',
      done: 'Income voided.',
      failed: 'Failed to void income',
      task: 'Could not void the income entry.',
    },
  },
};

const VOID_RECORD: Record<CategoryRecordKind, (id: string, reason?: string) => Promise<unknown>> = {
  expense: (id, reason) => transactionService.voidExpense(id, reason),
  income: (id, reason) => transactionService.voidIncome(id, reason),
};

const CATEGORY_KEY = {
  expense: queryKeys.expenseCategories(),
  income: queryKeys.incomeCategories(),
} as const;

const TABS_ID = 'category-records';
const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
const sumAmounts = (rows: CategoryRecord[]) =>
  rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

/** A view after By category that only one kind has (Income › GST for Staff). */
export interface ExtraView {
  tab: TabItem;
  render: () => ReactNode;
}

export interface CategoryRecordPageProps {
  kind: CategoryRecordKind;
  selectedStation: any | null;
  userRole?: string;
  /** Page actions before Categories (Income: the link to Reports → GST). */
  actions?: ReactNode;
  extraViews?: ExtraView[];
}

/**
 * The Expenses and Income pages (#529): one view with the kind as a
 * parameter, so the two read the same apart from it. Tabs: the ledger, then
 * By category, then any `extraViews`. The ledger's range, search and
 * category filter sit in the Page Frame toolbar; its totals and table each
 * load in their own Data Section.
 */
export const CategoryRecordPage: React.FC<CategoryRecordPageProps> = ({
  kind,
  selectedStation,
  userRole,
  actions,
  extraViews = [],
}) => {
  const copy = COPY[kind];
  const stationId = selectedStation?.id ?? null;
  const expensesQ = useExpenses({ enabled: kind === 'expense' });
  const incomeQ = useIncome({ stationId: stationId ?? undefined }, { enabled: kind === 'income' });
  const recordsQ = kind === 'expense' ? expensesQ : incomeQ;
  const expenseCategoriesQ = useExpenseCategories({ enabled: kind === 'expense' });
  const incomeCategoriesQ = useIncomeCategories({ enabled: kind === 'income' });
  const categories = (kind === 'expense' ? expenseCategoriesQ : incomeCategoriesQ).data ?? [];

  const invalidateOperational = useInvalidateOperational();
  const qc = useQueryClient();
  const toast = useToast();
  const runTask = useRunTask();
  const ask = useAsk();

  const role = (userRole as any) ?? 'Staff';
  const canManageCategories = canManageExpenseCategory(role);
  const canVoid = canVoidExpense(role);

  const timeZone = selectedStation?.settings?.timezone;
  // Office records are dated by entry date: the plain station calendar date (ADR 0005).
  const entryClock = useMemo(() => ({ timeZone }), [timeZone]);

  const [activeTab, setActiveTab] = useState('ledger');
  const [range, setRange] = useState<DateRange>(() => computeRange('this-month', entryClock));
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  const records = useMemo<CategoryRecord[]>(() => recordsQ.data ?? [], [recordsQ.data]);

  // Corrections are never edits: an entry is voided (status → VOIDED) and its
  // ledger posting reversed, keeping history append-only.
  const handleVoid = useCallback(
    async (row: CategoryRecord) => {
      const { confirmed, value } = await ask({
        title: copy.void.title,
        message: (
          <>
            {formatMoney(row.amount)} · {row.categoryName || FALLBACK_CATEGORY[kind]}. The entry
            stays in the ledger marked
            <strong> Voided</strong> and its money posting is reversed. This cannot be undone.
          </>
        ),
        input: { label: 'Reason (optional)', placeholder: 'e.g. duplicate entry, wrong amount' },
        confirmLabel: copy.void.confirm,
        danger: true,
      });
      if (!confirmed) return;
      try {
        await VOID_RECORD[kind](row.id, value);
        toast.success(copy.void.done);
        await invalidateOperational(stationId);
      } catch (err: any) {
        toast.error(err.message || copy.void.failed);
      }
    },
    [ask, copy, invalidateOperational, kind, stationId, toast],
  );

  const columns = useMemo(
    () =>
      buildCategoryRecordColumns(
        kind,
        canVoid ? (row) => runTask(handleVoid(row), copy.void.task) : undefined,
      ),
    [canVoid, copy, handleVoid, kind, runTask],
  );

  // KPIs: fixed windows (today / this month), independent of the table range filter.
  const kpis = useMemo(() => {
    const today = computeRange('today', entryClock);
    const month = computeRange('this-month', entryClock);
    const inWindow = (r: CategoryRecord, w: DateRange) =>
      !!r.entryDate && r.entryDate >= w.from && r.entryDate <= w.to;
    const active = records.filter((r) => !isVoided(r));
    const monthRows = active.filter((r) => inWindow(r, month));
    const monthTotal = sumAmounts(monthRows);
    const cashMonth = sumAmounts(
      monthRows.filter((r) => CASH_ACCOUNT_TYPES.includes(r.accountType as any)),
    );
    return {
      values: [
        sumAmounts(active.filter((r) => inWindow(r, today))),
        monthTotal,
        cashMonth,
        monthTotal - cashMonth,
      ],
      hints: ['entry date', entries(monthRows.length), 'this month', 'this month'],
    };
  }, [records, entryClock]);

  // Newest first: the ledger opens sorted by entry date, latest on top.
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return records
      .filter((r) => {
        if (categoryFilter && r.categoryId !== categoryFilter) return false;
        if (q) {
          const desc = r.description?.toLowerCase().includes(q) ?? false;
          const cat = r.categoryName?.toLowerCase().includes(q) ?? false;
          if (!desc && !cat) return false;
        }
        const d = r.entryDate;
        return !(d && (d < range.from || d > range.to));
      })
      .sort((a, b) => (b.entryDate ?? '').localeCompare(a.entryDate ?? ''));
  }, [records, categoryFilter, search, range.from, range.to]);

  // Voided entries stay listed but add nothing; the label says so when one shows.
  const totalRow = useMemo<TotalRow>(() => {
    const active = rows.filter((r) => !isVoided(r));
    return {
      label: active.length < rows.length ? 'Total excl. voided' : 'Total',
      values: { amount: sumAmounts(active) },
    };
  }, [rows]);

  if (!selectedStation) {
    return (
      <p className="p-6 text-[13px] text-ink-muted">Please select a station to view {copy.noun}.</p>
    );
  }

  const tabs: TabItem[] = [
    copy.ledgerTab,
    { id: 'analytics', label: 'By category', concept: 'by-category' },
    ...extraViews.map((v) => v.tab),
  ];
  const extra = extraViews.find((v) => v.tab.id === activeTab);

  return (
    <>
      <PageFrame
        route={copy.route}
        subtitle={copy.subtitle}
        actions={
          <>
            {actions}
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
              onClick={() => openQuickEntry(kind, { origin: 'page' })}
            >
              {copy.record}
            </Button>
          </>
        }
        tabs={
          <Tabs
            id={TABS_ID}
            aria-label={copy.tabsLabel}
            activeId={activeTab}
            onChange={setActiveTab}
            tabs={tabs}
          />
        }
        toolbar={
          activeTab === 'ledger' ? (
            <div className="flex w-full flex-wrap items-end gap-2.5">
              <DateRangeField value={range} onChange={setRange} clock={entryClock} size="sm" />
              <div className="flex-1" />
              <div className="w-[220px]">
                <SearchInput
                  inputSize="sm"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search description / category…"
                />
              </div>
              <div className="w-[190px]">
                <Select
                  inputSize="sm"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
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
              <span className="flex h-7 items-center">
                <InfoTip label={`About ${kind} anchoring`} placement="bottom">
                  {copy.about}
                </InfoTip>
              </span>
            </div>
          ) : undefined
        }
      >
        <div {...tabPanelProps(TABS_ID, activeTab)} className="flex flex-col gap-4">
          {activeTab === 'ledger' && (
            <>
              <DataSection
                title={`${kind} totals`}
                query={recordsQ}
                shape="cards"
                placeholderHeight={90}
              >
                <KpiStrip columns="auto">
                  {copy.kpis.map((k, i) => (
                    <KpiTile
                      key={k.label}
                      dot={k.dot}
                      valueTone={k.tone}
                      label={k.label}
                      value={formatMoney(kpis.values[i])}
                      hint={kpis.hints[i]}
                    />
                  ))}
                </KpiStrip>
              </DataSection>

              <section className="flex flex-col gap-2">
                <SectionHeader
                  title={copy.ledger}
                  subtitle={recordsQ.data ? entries(rows.length) : undefined}
                />
                <DataSection
                  title={copy.noun}
                  query={recordsQ}
                  placeholderHeight={240}
                  flush
                  isEmpty={rows.length === 0}
                  empty={
                    <div className="p-3">
                      <EmptyState
                        compact
                        icon={<Icon name={copy.icon} size="md" />}
                        title={records.length === 0 ? `No ${copy.noun} yet` : 'No matches'}
                        description={
                          records.length === 0
                            ? `Record your first ${kind} with “${copy.record}”.`
                            : 'Adjust the range, search, or category filter.'
                        }
                      />
                    </div>
                  }
                >
                  <InteractiveTable
                    bare
                    columns={columns}
                    rows={rows}
                    rowKey={(r) => r.id}
                    totalRow={totalRow}
                    title={copy.noun}
                  />
                </DataSection>
              </section>
            </>
          )}

          {activeTab === 'analytics' && (
            <CategoryAnalytics selectedStation={selectedStation} kind={kind} />
          )}

          {extra?.render()}
        </div>
      </PageFrame>

      <CategoryManagerDrawer
        kind={kind}
        isOpen={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        categories={categories}
        onChanged={() => qc.invalidateQueries({ queryKey: CATEGORY_KEY[kind] })}
        canManage={canManageCategories}
      />
    </>
  );
};
