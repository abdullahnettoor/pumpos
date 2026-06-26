import { schema, type DbClient } from '@pump/db';
import type { Expense, ExpenseRepository } from '@pump/core';

export class DrizzleExpenseRepository implements ExpenseRepository {
  constructor(private readonly db: DbClient) {}
  async save(e: Expense): Promise<void> {
    await this.db
      .insert(schema.expenses)
      .values({
        id: e.id,
        shiftId: e.shiftId,
        businessDayId: e.businessDayId,
        categoryId: e.categoryId,
        amount: e.amount,
        paidFrom: e.paidFrom,
        affectsDrawer: e.affectsDrawer,
        description: e.description,
        status: e.status,
        createdAt: new Date(e.createdAt),
        updatedAt: new Date(e.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.expenses.id,
        set: {
          amount: e.amount,
          paidFrom: e.paidFrom,
          affectsDrawer: e.affectsDrawer,
          description: e.description,
          status: e.status,
          updatedAt: new Date(e.updatedAt),
        },
      });
  }
}
