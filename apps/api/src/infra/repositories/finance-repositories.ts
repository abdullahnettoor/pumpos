import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { Expense, ExpenseRepository, OtherIncome, IncomeRepository } from '@pump/core';

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

function toIncome(r: typeof schema.otherIncome.$inferSelect): OtherIncome {
  return {
    id: r.id,
    shiftId: r.shiftId,
    businessDayId: r.businessDayId,
    categoryId: r.categoryId,
    amount: r.amount,
    receivedInto: r.receivedInto as OtherIncome['receivedInto'],
    affectsDrawer: r.affectsDrawer,
    payer: r.payer ?? null,
    referenceType: r.referenceType ?? null,
    referenceId: r.referenceId ?? null,
    description: r.description ?? null,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class DrizzleIncomeRepository implements IncomeRepository {
  constructor(private readonly db: DbClient) {}
  async findById(id: string): Promise<OtherIncome | null> {
    const [r] = await this.db.select().from(schema.otherIncome).where(eq(schema.otherIncome.id, id)).limit(1);
    return r ? toIncome(r) : null;
  }
  async save(i: OtherIncome): Promise<void> {
    await this.db
      .insert(schema.otherIncome)
      .values({
        id: i.id,
        shiftId: i.shiftId,
        businessDayId: i.businessDayId,
        categoryId: i.categoryId,
        amount: i.amount,
        receivedInto: i.receivedInto,
        affectsDrawer: i.affectsDrawer,
        payer: i.payer,
        referenceType: i.referenceType,
        referenceId: i.referenceId,
        description: i.description,
        status: i.status,
        createdAt: new Date(i.createdAt),
        updatedAt: new Date(i.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.otherIncome.id,
        set: {
          amount: i.amount,
          receivedInto: i.receivedInto,
          affectsDrawer: i.affectsDrawer,
          payer: i.payer,
          description: i.description,
          status: i.status,
          updatedAt: new Date(i.updatedAt),
        },
      });
  }
}
