import React from 'react';
import { CategoryRecordPage } from './categories/CategoryRecordPage.js';

interface ExpensesListProps {
  selectedStation: any | null;
  defaultShiftId?: string;
  userRole?: string;
}

/** Expenses: the shared Expense / Income page with `kind="expense"` (#529). */
export const ExpensesList: React.FC<ExpensesListProps> = ({ selectedStation, userRole }) => (
  <CategoryRecordPage kind="expense" selectedStation={selectedStation} userRole={userRole} />
);
