import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { can } from '@pump/shared';
import { principalFor } from '../../access/effectivePrincipal.js';
import { ROUTES, type RoutePath } from '../../nav-intent/routes.js';
import {
  mutationKeys,
  queryKeys,
  useExpenseCategories,
  useExpenses,
  useIncome,
  useIncomeCategories,
  useInvalidateOperational,
} from '../../query/hooks.js';
import { openQuickEntry } from '../../quick-entry/store.js';
import { officeSubmitKeys, sendKeyed } from '../../office-records/submitKeys.js';
import { useVoidCategoryRecord } from '../../office-records/useRecordOfficeRecord.js';
import { useWriteStates } from '../../query/pendingWrites.js';
import { useFlashingRows } from '../../utils/rowFlash.js';
import {
  recordWriteKey,
  savingRecordRows,
  voidWriteKey,
  withVoidWrites,
} from './categoryRecordWrites.js';
import {
  Button,
  DataSection,
  DateRangeMenu,
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
  computeRange,
  type DateRange,
  type IconName,
  type KpiScope,
  type TabItem,
  type TotalRow,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { CASH_ACCOUNT_TYPES } from '../../utils/ledgerLabels.js';
import { countOf, inWindow, sumAmounts } from '../../utils/ledgerWindow.js';
import { useRefreshTask, useRunTask } from '../../utils/runTask.js';
import { PageFrame } from '../page-frame/index.js';
import { InfoTip } from '../primitives/InfoTip.js';
import { useAsk } from '../primitives/ConfirmDialog.js';
import { CategoryAnalytics } from '../expenses/CategoryAnalytics.js';
import { CategoryManagerDrawer, type CategoryRecordKind } from './CategoryManagerDrawer.js';
import {
  FALLBACK_CATEGORY,
  buildCategoryRecordColumns,
  isVoided,
  type CategoryRecord,
} from './categoryRecordColumns.js';

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
    /** Tile labels: today, this month, into/out of cash, the other accounts. */
    kpis: [string, string, string, string];
    about: string;
    void: {
      title: string;
      confirm: string;
      task: string;
      saved: string;
    };
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
    kpis: ['Spent today', 'Spent this month', 'Cash in hand / petty', 'From bank / owner'],
    about:
      'Expenses are office records: dated by entry date and paid from the chosen account. They never touch a shift drawer.',
    void: {
      title: 'Void this expense?',
      confirm: 'Void expense',
      task: 'Could not void the expense.',
      saved: 'Expense voided.',
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
      'Received today',
      'Received this month',
      'Into cash in hand / petty',
      'Into bank / owner',
    ],
    about:
      'Income is an office record: dated by entry date and received into the chosen account. It never touches a shift drawer.',
    void: {
      title: 'Void this income entry?',
      confirm: 'Void income',
      task: 'Could not void the income entry.',
      saved: 'Income voided.',
    },
  },
};

const CATEGORY_KEY = {
  expense: queryKeys.expenseCategories(),
  income: queryKeys.incomeCategories(),
} as const;

const TABS_ID = 'category-records';
const entries = (n: number) => countOf(n, 'entry', 'entries');

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
 * By category, then any `extraViews`.
 *
 * The ledger is layout B (#567): the fixed KPI tiles sit on top, each naming
 * its period (Today, the month), and the range, search, category filter and
 * info tip sit in the ledger's section header, directly above the table they
 * filter. Totals and table each load in their own Data Section.
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
  const runTask = useRunTask();
  const refresh = useRefreshTask();
  const ask = useAsk();
  const voidRecord = useVoidCategoryRecord();
  // Saves and voids in flight, from the writes themselves (#606).
  const recordWrites = useWriteStates(
    mutationKeys.officeRecord(),
    recordWriteKey,
    `${kind}:${stationId ?? ''}`,
  );
  const voidWrites = useWriteStates(mutationKeys.voidOfficeRecord(), voidWriteKey, kind);
  const flashing = useFlashingRows();

  const role = (userRole as any) ?? 'Staff';
  const canManageCategories = can(principalFor(role), 'expenses.categories');
  const canVoid = can(principalFor(role), 'expenses.void');

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
        // One key per void through the shared store: a retry after a lost
        // answer reuses it, so it cannot void twice.
        await sendKeyed(
          officeSubmitKeys.session(`${kind}:void:${row.id}`),
          { stationId, id: row.id, reason: value },
          (idempotencyKey) =>
            voidRecord.mutateAsync({ kind, id: row.id, stationId, reason: value, idempotencyKey }),
        );
        // The row reads Voided and is highlighted (#606): no toast. The rest
        // refreshes in the background; a failure says so briefly, with Retry.
        refresh(() => invalidateOperational(stationId, { throwOnError: true }), copy.void.saved);
      } catch {
        // The row says it was not voided, and why (#606).
      }
    },
    [ask, copy, invalidateOperational, kind, stationId, voidRecord, refresh],
  );

  const columns = useMemo(
    () =>
      buildCategoryRecordColumns(
        kind,
        canVoid ? (row) => runTask(handleVoid(row), copy.void.task) : undefined,
      ),
    [canVoid, copy, handleVoid, kind, runTask],
  );

  // KPIs: fixed windows (today / this month), independent of the table range
  // filter. Each tile's period chip says which window it reads.
  const kpis = useMemo(() => {
    const today = computeRange('today', entryClock);
    const month = computeRange('this-month', entryClock);
    const monthScope: KpiScope = { month: month.from };
    const active = records.filter((r) => !isVoided(r));
    const monthRows = active.filter((r) => inWindow(r.entryDate, month));
    const monthTotal = sumAmounts(monthRows);
    const cashMonth = sumAmounts(
      monthRows.filter((r) => CASH_ACCOUNT_TYPES.includes(r.accountType as any)),
    );
    return {
      values: [
        sumAmounts(active.filter((r) => inWindow(r.entryDate, today))),
        monthTotal,
        cashMonth,
        monthTotal - cashMonth,
      ],
      scopes: ['today', monthScope, monthScope, monthScope] as KpiScope[],
      hints: ['by entry date', entries(monthRows.length), undefined, undefined],
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
  // What the table lists: entries still saving on top, then the ledger with its voids in flight.
  const tableRows = useMemo(
    () => [...savingRecordRows(recordWrites), ...withVoidWrites(rows, voidWrites)],
    [rows, recordWrites, voidWrites],
  );

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
                  {copy.kpis.map((label, i) => (
                    <KpiTile
                      key={label}
                      label={label}
                      scope={kpis.scopes[i]}
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
                  controls={{
                    range: (
                      <DateRangeMenu
                        value={range}
                        onChange={setRange}
                        clock={entryClock}
                        align="end"
                        aria-label={`${copy.ledger} period`}
                      />
                    ),
                    search: (
                      <div className="w-[220px]">
                        <SearchInput
                          inputSize="sm"
                          value={search}
                          onChange={setSearch}
                          placeholder="Search description / category…"
                        />
                      </div>
                    ),
                    filters: (
                      <div className="w-[170px]">
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
                    ),
                    info: (
                      <InfoTip label={`About ${kind} anchoring`} placement="bottom">
                        {copy.about}
                      </InfoTip>
                    ),
                  }}
                />
                <DataSection
                  title={copy.noun}
                  query={recordsQ}
                  placeholderHeight={240}
                  flush
                  isEmpty={tableRows.length === 0}
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
                    rows={tableRows}
                    rowKey={(r) => r.id}
                    flashRowIds={flashing}
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
