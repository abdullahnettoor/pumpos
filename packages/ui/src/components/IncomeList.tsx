import React, { useCallback, useMemo, useState, useEffect } from 'react';
import type { ExpenseEntryFormValues } from '@pump/shared';
import { canManageExpenseCategory, canVoidExpense } from '@pump/shared';
import { CloudTransactionService } from '../services/cloud.js';
import { Plus, HelpCircle, Tags, Banknote, Percent, Info } from 'lucide-react';
import { PageLayout } from './primitives/PageLayout.js';
import { DataTable } from './primitives/DataTable.js';
import { DateRangeField, computeRange } from './primitives/DateRangeField.js';
import type { DateRange } from './primitives/DateRangeField.js';
import { inr } from '../utils/format.js';
import { useToast } from './primitives/ToastProvider.js';
import { useAsk } from './primitives/ConfirmDialog.js';
import { Drawer } from './Drawer.js';
import { ExpenseEntryForm } from './transactions/ExpenseEntryForm.js';
import {
  useIncome,
  useIncomeCategories,
  useInvalidateOperational,
  useIncomeGstRegister,
} from '../query/hooks.js';
import { useQueryClient } from '@tanstack/react-query';
import {
  Panel,
  Button,
  KpiStrip,
  KpiTile,
  EmptyState,
  SearchInput,
  Select,
  DateText,
} from '../pump-ds/index.js';
import { Tabs } from './primitives/Tabs.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { buildIncomeColumns } from './income/columns.js';
import { IncomeCategoryManagerDrawer } from './income/IncomeCategoryManagerDrawer.js';
import { useRunTask } from '../utils/runTask.js';

const transactionService = new CloudTransactionService();

type IncomeTab = 'ledger' | 'gst';

interface IncomeListProps {
  selectedStation: any | null;
  userRole?: string;
}

export const IncomeList: React.FC<IncomeListProps> = ({ selectedStation, userRole }) => {
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

  const income = useMemo(() => incomeQ.data ?? [], [incomeQ.data]);
  const categories = categoriesQ.data ?? [];
  const canManageCategories = canManageExpenseCategory((userRole as any) ?? 'Staff');
  const canVoid = canVoidExpense((userRole as any) ?? 'Staff');

  const [activeTab, setActiveTab] = useState<IncomeTab>('ledger');
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

  const handleAddIncome = async (values: ExpenseEntryFormValues) => {
    try {
      setSubmitting(true);
      setFormError(null);
      await transactionService.recordIncome({
        stationId: stationId ?? undefined,
        transactionDate: values.transactionDate || undefined,
        receivedInto: 'BANK',
        categoryId: values.categoryId,
        amount: Number(values.amount),
        description: values.description || undefined,
        accountId: values.accountId || undefined,
      });
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
    const today = computeRange('today', clock);
    const month = computeRange('this-month', clock);
    const active = income.filter((e: any) => e.status !== 'VOIDED');
    const inWindow = (e: any, r: DateRange) => {
      const d = e.businessDate ?? e.shiftDate;
      return d && d >= r.from && d <= r.to;
    };
    const monthRows = active.filter((e: any) => inWindow(e, month));
    const todayTotal = active
      .filter((e: any) => inWindow(e, today))
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const monthTotal = monthRows.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const drawerMonth = monthRows
      .filter((e: any) => e.receivedInto === 'SHIFT_CASH')
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
    const otherMonth = monthTotal - drawerMonth;
    return { todayTotal, monthTotal, entriesMonth: monthRows.length, drawerMonth, otherMonth };
  }, [income, clock]);

  // FI4 — output GST register. Read straight from the API (not the tiered cache):
  // it is a period report driven by its own date inputs, not the ledger range.
  const [gstRange, setGstRange] = useState<DateRange>(() => computeRange('this-month', clock));
  // Read through the shared hook, fetched only while the GST tab is showing.
  // The old version loaded it from an effect keyed on the tab, which is the
  // same thing a gated query expresses without the effect or the local mirror.
  const gstQ = useIncomeGstRegister(
    { stationId, from: gstRange.from, to: gstRange.to },
    { enabled: !!stationId && activeTab === 'gst' },
  );
  const gstRows = useMemo(() => gstQ.data ?? [], [gstQ.data]);
  const gstLoading = gstQ.isFetching;
  const gstError = gstQ.error ? gstQ.error.message : null;

  const gstTotals = useMemo(
    () =>
      gstRows.reduce(
        (acc, r) => ({
          taxable: acc.taxable + Number(r.taxableAmount || 0),
          cgst: acc.cgst + Number(r.cgst || 0),
          sgst: acc.sgst + Number(r.sgst || 0),
          igst: acc.igst + Number(r.igst || 0),
          cess: acc.cess + Number(r.cess || 0),
          gross: acc.gross + Number(r.amount || 0),
        }),
        { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, gross: 0 },
      ),
    [gstRows],
  );
  const gstOutputTotal = gstTotals.cgst + gstTotals.sgst + gstTotals.igst + gstTotals.cess;

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
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Tags />}
              onClick={() => setCategoryManagerOpen(true)}
            >
              Categories
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus />}
              onClick={openDrawer}
              disabled={categories.length === 0}
            >
              Add Income
            </Button>
          </div>
        }
        toolbar={
          <Tabs
            variant="underline"
            aria-label="Income"
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as IncomeTab)}
            tabs={[
              { id: 'ledger', label: 'Income Ledger', icon: <Banknote size={15} /> },
              { id: 'gst', label: 'GST on Income', icon: <Percent size={15} /> },
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
                hint="business day"
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
                label="Into Cash Drawer"
                value={inr(kpis.drawerMonth)}
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
              <DateRangeField value={range} onChange={setRange} clock={clock} size="sm" />
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
                title="Other income posts to the selected business day — no open shift required. Cash income entered from the shift workspace reconciles into the drawer."
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
                <HelpCircle size={14} />
              </button>
            </div>

            <Panel flush title="Income ledger">
              {incomeQ.isLoading ? (
                <div style={{ padding: '16px' }}>
                  <EmptyState
                    compact
                    icon={<Banknote />}
                    title="Loading…"
                    description="Fetching income."
                  />
                </div>
              ) : filteredIncome.length === 0 ? (
                <div style={{ padding: '12px' }}>
                  <EmptyState
                    compact
                    icon={<Banknote />}
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
                  emptyMessage="No matching income found."
                  getRowId={(r: any) => r.id}
                  initialSorting={[{ id: 'businessDate', desc: true }]}
                />
              )}
            </Panel>
          </div>
        )}

        {activeTab === 'gst' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                backgroundColor: 'var(--state-info-bg)',
                color: 'var(--state-info-fg)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-card)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid var(--border-soft)',
              }}
            >
              <Info size={14} />
              <span>
                Output GST you collected on other income (rentals, commissions, advertising). The
                split is frozen from the category&rsquo;s GST rate at the time each entry was
                recorded. Voided entries are excluded.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <DateRangeField value={gstRange} onChange={setGstRange} clock={clock} size="sm" />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void gstQ.refetch()}
                loading={gstLoading}
              >
                Apply
              </Button>
            </div>

            <KpiStrip columns="auto">
              <KpiTile label="Taxable Value" value={inr(gstTotals.taxable)} hint="net of GST" />
              <KpiTile label="CGST" value={inr(gstTotals.cgst)} />
              <KpiTile label="SGST" value={inr(gstTotals.sgst)} />
              <KpiTile label="IGST" value={inr(gstTotals.igst)} />
              <KpiTile
                dot="brand"
                valueTone="brand"
                label="Output GST"
                value={inr(gstOutputTotal)}
                hint={`${gstRows.length} ${gstRows.length === 1 ? 'entry' : 'entries'}`}
              />
            </KpiStrip>

            <Panel flush title="GST register">
              {gstError ? (
                <div
                  style={{
                    padding: '12px',
                    color: 'var(--state-danger-fg)',
                    backgroundColor: 'var(--state-danger-bg)',
                    fontSize: '12px',
                  }}
                >
                  {gstError}
                </div>
              ) : gstLoading ? (
                <div style={{ padding: '16px' }}>
                  <LoadingSpinner text="Loading GST register…" />
                </div>
              ) : gstRows.length === 0 ? (
                <div style={{ padding: '12px' }}>
                  <EmptyState
                    compact
                    icon={<Percent />}
                    title="No GST income in this period"
                    description="Income only appears here when its category carries a GST rate."
                  />
                </div>
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                      textAlign: 'left',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          backgroundColor: 'var(--bg-surface-alt)',
                          borderBottom: '1px solid var(--border-soft)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <th style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          Date
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>Category</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600 }}>
                          Payer / Description
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          Rate
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          Taxable
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          CGST
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          SGST
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          IGST
                        </th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'right' }}>
                          Received
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {gstRows.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <DateText value={r.businessDate} variant="compact" tone="muted" />
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              color: 'var(--text-strong)',
                              fontWeight: 600,
                            }}
                          >
                            {r.categoryName}
                            {r.hsnCode && (
                              <div
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--text-muted)',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 400,
                                }}
                              >
                                HSN/SAC {r.hsnCode}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-default)' }}>
                            {r.payer || r.description || '—'}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {Number(r.gstRate || 0)}%{r.interState ? ' · IGST' : ''}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {inr(Number(r.taxableAmount || 0))}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {inr(Number(r.cgst || 0))}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {inr(Number(r.sgst || 0))}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {inr(Number(r.igst || 0))}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              color: 'var(--text-strong)',
                            }}
                          >
                            {inr(Number(r.amount || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr
                        style={{
                          backgroundColor: 'var(--bg-surface-alt)',
                          fontWeight: 700,
                          color: 'var(--text-strong)',
                        }}
                      >
                        <td style={{ padding: '8px 10px' }} colSpan={4}>
                          Total
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {inr(gstTotals.taxable)}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {inr(gstTotals.cgst)}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {inr(gstTotals.sgst)}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {inr(gstTotals.igst)}
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {inr(gstTotals.gross)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}
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
