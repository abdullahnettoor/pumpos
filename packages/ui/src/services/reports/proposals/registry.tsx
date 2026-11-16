import React, { type ComponentType, type ReactElement } from 'react';
import type { ProposalContext } from './shared.js';
import { GENERATED, LETTERHEAD, STATION_NAME } from './samples/common.js';

/** The station and print time every proposal renders with. */
export const PROPOSAL_CTX: ProposalContext = {
  letterhead: LETTERHEAD,
  stationName: STATION_NAME,
  generatedLabel: GENERATED,
};

export interface ProposalEntry {
  /** File order: `01` … `17` (`00` is the overview). */
  nn: string;
  slug: string;
  title: string;
  render: () => Promise<ReactElement>;
}

type DocModule = Record<string, unknown>;

/**
 * A proposal's document on its sample, loaded on demand: each template and
 * sample is its own module, so one broken template never stops the others.
 */
const doc =
  (
    docModule: () => Promise<DocModule>,
    component: string,
    sampleModule: () => Promise<DocModule>,
    sample: string,
  ) =>
  async (): Promise<ReactElement> => {
    const [d, s] = await Promise.all([docModule(), sampleModule()]);
    const Doc = d[component] as ComponentType<{ data: unknown; ctx: ProposalContext }>;
    return <Doc data={s[sample]} ctx={PROPOSAL_CTX} />;
  };

/** Every proposal PDF, in file order (`docs/report-proposals/pdf/<nn>-<slug>.pdf`). */
export const PROPOSALS: ProposalEntry[] = [
  {
    nn: '00',
    slug: 'overview',
    title: 'Report proposals — overview',
    render: doc(
      () => import('./overviewDoc.js'),
      'OverviewDoc',
      () => import('./samples/overviewSample.js'),
      'OVERVIEW_SAMPLE',
    ),
  },
  {
    nn: '01',
    slug: 'product-wise-sales',
    title: 'Product-wise Sales Report',
    render: doc(
      () => import('./productSalesDoc.js'),
      'ProductSalesDoc',
      () => import('./samples/productSalesSample.js'),
      'PRODUCT_SALES_SAMPLE',
    ),
  },
  {
    nn: '02',
    slug: 'product-wise-purchases',
    title: 'Product-wise Purchase Report',
    render: doc(
      () => import('./productPurchaseDoc.js'),
      'ProductPurchaseDoc',
      () => import('./samples/productPurchaseSample.js'),
      'PRODUCT_PURCHASE_SAMPLE',
    ),
  },
  {
    nn: '03',
    slug: 'stock-statement',
    title: 'Stock Report (period statement)',
    render: doc(
      () => import('./stockStatementDoc.js'),
      'StockStatementDoc',
      () => import('./samples/stockStatementSample.js'),
      'STOCK_STATEMENT_SAMPLE',
    ),
  },
  {
    nn: '04',
    slug: 'tank-stock-variation',
    title: 'Fuel Tank Stock & Variation Register',
    render: doc(
      () => import('./tankVariationDoc.js'),
      'TankVariationDoc',
      () => import('./samples/tankVariationSample.js'),
      'TANK_VARIATION_SAMPLE',
    ),
  },
  {
    nn: '05',
    slug: 'cash-book',
    title: 'Cash Book',
    render: doc(
      () => import('./cashBookDoc.js'),
      'CashBookDoc',
      () => import('./samples/cashBookSample.js'),
      'CASH_BOOK_SAMPLE',
    ),
  },
  {
    nn: '06',
    slug: 'shift-cash-variance',
    title: 'Shift Cash Variance Report',
    render: doc(
      () => import('./shiftCashVarianceDoc.js'),
      'ShiftCashVarianceDoc',
      () => import('./samples/shiftCashVarianceSample.js'),
      'SHIFT_CASH_VARIANCE_SAMPLE',
    ),
  },
  {
    nn: '07',
    slug: 'attendant-cash-variance',
    title: 'Attendant Cash Variance (Shortage) Report',
    render: doc(
      () => import('./attendantVarianceDoc.js'),
      'AttendantVarianceDoc',
      () => import('./samples/attendantVarianceSample.js'),
      'ATTENDANT_VARIANCE_SAMPLE',
    ),
  },
  {
    nn: '08',
    slug: 'pos-collection-reconciliation',
    title: 'POS Collection & Reconciliation',
    render: doc(
      () => import('./posReconciliationDoc.js'),
      'PosReconciliationDoc',
      () => import('./samples/posReconciliationSample.js'),
      'POS_RECONCILIATION_SAMPLE',
    ),
  },
  {
    nn: '09',
    slug: 'sundry-debtors-ageing',
    title: 'Sundry Debtors (Receivables) with Ageing',
    render: doc(
      () => import('./debtorsAgeingDoc.js'),
      'DebtorsAgeingDoc',
      () => import('./samples/debtorsAgeingSample.js'),
      'DEBTORS_AGEING_SAMPLE',
    ),
  },
  {
    nn: '10',
    slug: 'sundry-creditors-ageing',
    title: 'Sundry Creditors (Payables) with Ageing',
    render: doc(
      () => import('./creditorsAgeingDoc.js'),
      'CreditorsAgeingDoc',
      () => import('./samples/creditorsAgeingSample.js'),
      'CREDITORS_AGEING_SAMPLE',
    ),
  },
  {
    nn: '11',
    slug: 'ledger',
    title: 'Ledger Report',
    render: doc(
      () => import('./ledgerReportDoc.js'),
      'LedgerReportDoc',
      () => import('./samples/ledgerReportSample.js'),
      'LEDGER_REPORT_SAMPLE',
    ),
  },
  {
    nn: '12',
    slug: 'expense',
    title: 'Expense Report',
    render: doc(
      () => import('./expenseReportDoc.js'),
      'ExpenseReportDoc',
      () => import('./samples/expenseReportSample.js'),
      'EXPENSE_REPORT_SAMPLE',
    ),
  },
  {
    nn: '13',
    slug: 'income',
    title: 'Income Report',
    render: doc(
      () => import('./incomeReportDoc.js'),
      'IncomeReportDoc',
      () => import('./samples/incomeReportSample.js'),
      'INCOME_REPORT_SAMPLE',
    ),
  },
  {
    nn: '14',
    slug: 'gstr-1',
    title: 'GSTR-1 (first version)',
    render: doc(
      () => import('./gstr1Doc.js'),
      'Gstr1Doc',
      () => import('./samples/gstr1Sample.js'),
      'GSTR1_SAMPLE',
    ),
  },
  {
    nn: '15',
    slug: 'gstr-3b',
    title: 'GSTR-3B summary (first version)',
    render: doc(
      () => import('./gstr3bDoc.js'),
      'Gstr3bDoc',
      () => import('./samples/gstr3bSample.js'),
      'GSTR3B_SAMPLE',
    ),
  },
  {
    nn: '16',
    slug: 'profit-and-loss',
    title: 'Profit & Loss (improved)',
    render: doc(
      () => import('./profitLossDoc.js'),
      'ProfitLossDoc',
      () => import('./samples/profitLossSample.js'),
      'PROFIT_LOSS_SAMPLE',
    ),
  },
  {
    nn: '17',
    slug: 'day-book',
    title: 'Day Book',
    render: doc(
      () => import('./dayBookDoc.js'),
      'DayBookDoc',
      () => import('./samples/dayBookSample.js'),
      'DAY_BOOK_SAMPLE',
    ),
  },
];
