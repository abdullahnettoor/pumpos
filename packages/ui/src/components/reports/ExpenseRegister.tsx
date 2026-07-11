import React from 'react';
import { ExpenseAnalytics } from '../expenses/ExpenseAnalytics.js';

export interface ExpenseRegisterProps {
  selectedStation: any | null;
}

/**
 * Expense register (Phase L4) — now a thin wrapper over the shared
 * `ExpenseAnalytics`, the single source of truth used by both the Reports
 * "Expense Register" tab and the Expenses screen "By Category" tab.
 */
export const ExpenseRegister: React.FC<ExpenseRegisterProps> = ({ selectedStation }) => (
  <ExpenseAnalytics selectedStation={selectedStation} />
);
