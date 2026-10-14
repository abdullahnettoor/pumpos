import { CloudTransactionService } from '../../services/cloud.js';

const service = new CloudTransactionService();

export type CategoryRecordKind = 'expense' | 'income';

/** An income category's GST rate and HSN/SAC (the product tax shape). */
export type CategoryTax = { gst_rate: number; hsn_code: string } | null;

/** The one create/rename path for expense and income categories. */
export const CATEGORY_API = {
  expense: {
    create: (name: string, _taxConfig?: CategoryTax) => service.createExpenseCategory({ name }),
    update: (id: string, name: string, _taxConfig?: CategoryTax) =>
      service.updateExpenseCategory(id, { name }),
  },
  income: {
    create: (name: string, taxConfig?: CategoryTax) =>
      service.createIncomeCategory({ name, taxConfig }),
    update: (id: string, name: string, taxConfig?: CategoryTax) =>
      service.updateIncomeCategory(id, { name, taxConfig }),
  },
} as const;
