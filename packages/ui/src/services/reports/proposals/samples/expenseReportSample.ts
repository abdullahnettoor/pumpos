import type { ExpenseReportData } from '../expenseReportDoc.js';
import { PERIOD } from './common.js';
import { EXPENSE_HEADS, OCT_EXPENSES } from './financeMonth.js';

const order = (t: string) => (t === 'Direct' ? 0 : 1);

export const EXPENSE_REPORT_SAMPLE: ExpenseReportData = {
  filters: { period: PERIOD, head: 'All', type: 'All', account: 'All' },
  heads: [...EXPENSE_HEADS].sort((a, b) => order(a.type) - order(b.type)),
  entries: OCT_EXPENSES,
};
