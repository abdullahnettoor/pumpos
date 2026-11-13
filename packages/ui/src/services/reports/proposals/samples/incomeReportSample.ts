import type { IncomeReportData } from '../incomeReportDoc.js';
import { PERIOD } from './common.js';
import { INCOME_HEADS, OCT_INCOME } from './financeMonth.js';

export const INCOME_REPORT_SAMPLE: IncomeReportData = {
  filters: { period: PERIOD, head: 'All', type: 'All', account: 'All' },
  heads: INCOME_HEADS.map((h) => ({ head: h.head, type: h.type })),
  entries: OCT_INCOME,
};
