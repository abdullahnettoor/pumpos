import type { HeadNature } from '@pump/shared';
import { CloudTransactionService } from '../../services/cloud.js';

const service = new CloudTransactionService();

export type CategoryRecordKind = 'expense' | 'income';

/** An income category's GST rate and HSN/SAC (the product tax shape). */
export type CategoryTax = { gst_rate: number; hsn_code: string } | null;

/** What a category write may carry besides its name. */
export interface CategoryWriteOptions {
  /** Income only. */
  taxConfig?: CategoryTax;
  /** The head's Type, Direct or Indirect. Left out, the server keeps / defaults to Indirect. */
  nature?: HeadNature;
}

/** The one create/rename path for expense and income categories. */
export const CATEGORY_API = {
  expense: {
    create: (name: string, { nature }: CategoryWriteOptions = {}) =>
      service.createExpenseCategory({ name, ...(nature && { nature }) }),
    update: (id: string, name: string, { nature }: CategoryWriteOptions = {}) =>
      service.updateExpenseCategory(id, { name, ...(nature && { nature }) }),
  },
  income: {
    create: (name: string, { taxConfig, nature }: CategoryWriteOptions = {}) =>
      service.createIncomeCategory({ name, taxConfig, ...(nature && { nature }) }),
    update: (id: string, name: string, { taxConfig, nature }: CategoryWriteOptions = {}) =>
      service.updateIncomeCategory(id, { name, taxConfig, ...(nature && { nature }) }),
  },
} as const;
