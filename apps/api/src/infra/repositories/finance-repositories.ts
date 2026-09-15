import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  Expense,
  ExpenseRepository,
  OtherIncome,
  IncomeRepository,
  IncomeCategory,
  IncomeCategoryRepository,
} from '@pump/core';

function toExpense(r: typeof schema.expenses.$inferSelect): Expense {
  return {
    id: r.id,
    shiftId: r.shiftId,
    businessDayId: r.businessDayId,
    categoryId: r.categoryId,
    amount: r.amount,
    paidFrom: r.paidFrom as Expense['paidFrom'],
    affectsDrawer: r.affectsDrawer,
    description: r.description ?? null,
    status: r.status,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class DrizzleExpenseRepository implements ExpenseRepository {
  constructor(private readonly db: DbClient) {}
  async findById(id: string): Promise<Expense | null> {
    const [r] = await this.db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id))
      .limit(1);
    return r ? toExpense(r) : null;
  }
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
        metadata: e.metadata ?? {},
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
          metadata: e.metadata ?? {},
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
    taxCategory: (r.taxCategory ?? 'NON_TAXABLE') as OtherIncome['taxCategory'],
    gstRate: r.gstRate ?? null,
    cessRate: r.cessRate ?? null,
    hsnCode: r.hsnCode ?? null,
    taxableAmount: r.taxableAmount ?? r.amount,
    cgst: r.cgst ?? '0',
    sgst: r.sgst ?? '0',
    igst: r.igst ?? '0',
    cess: r.cess ?? '0',
    taxSnapshot: (r.taxSnapshot as Record<string, unknown> | null) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class DrizzleIncomeRepository implements IncomeRepository {
  constructor(private readonly db: DbClient) {}
  async findById(id: string): Promise<OtherIncome | null> {
    const [r] = await this.db
      .select()
      .from(schema.otherIncome)
      .where(eq(schema.otherIncome.id, id))
      .limit(1);
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
        taxCategory: i.taxCategory,
        gstRate: i.gstRate,
        cessRate: i.cessRate,
        hsnCode: i.hsnCode,
        taxableAmount: i.taxableAmount,
        cgst: i.cgst,
        sgst: i.sgst,
        igst: i.igst,
        cess: i.cess,
        taxSnapshot: i.taxSnapshot,
        metadata: i.metadata ?? {},
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
          metadata: i.metadata ?? {},
          updatedAt: new Date(i.updatedAt),
        },
      });
  }
}

export class DrizzleIncomeCategoryRepository implements IncomeCategoryRepository {
  constructor(private readonly db: DbClient) {}
  async findById(id: string): Promise<IncomeCategory | null> {
    const [r] = await this.db
      .select()
      .from(schema.incomeCategories)
      .where(eq(schema.incomeCategories.id, id))
      .limit(1);
    if (!r) return null;
    return {
      id: r.id,
      organizationId: r.organizationId,
      name: r.name,
      taxConfig: (r.taxConfig as Record<string, unknown> | null) ?? null,
      isSystem: r.isSystem,
      isActive: r.isActive,
    };
  }
}
