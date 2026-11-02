import { and, eq, ne, sql } from 'drizzle-orm';
import { headNatureOf } from '@pump/shared';
import { schema, type DbClient, type DbExecutor } from '@pump/db';
import type {
  Expense,
  ExpenseRepository,
  OtherIncome,
  IncomeRepository,
  IncomeCategory,
  IncomeCategoryRepository,
  Head,
  HeadRepository,
} from '@pump/core';

function toExpense(r: typeof schema.expenses.$inferSelect): Expense {
  return {
    id: r.id,
    organizationId: r.organizationId,
    stationId: r.stationId,
    entryDate: r.entryDate,
    fundingAccountId: r.fundingAccountId,
    categoryId: r.categoryId,
    amount: r.amount,
    description: r.description ?? null,
    status: r.status,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export class DrizzleExpenseRepository implements ExpenseRepository {
  constructor(private readonly db: DbExecutor) {}
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
        organizationId: e.organizationId,
        stationId: e.stationId,
        entryDate: e.entryDate,
        fundingAccountId: e.fundingAccountId,
        categoryId: e.categoryId,
        amount: e.amount,
        // Office records never touch the Drawer (ADR 0005).
        affectsDrawer: false,
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
    organizationId: r.organizationId,
    stationId: r.stationId,
    entryDate: r.entryDate,
    fundingAccountId: r.fundingAccountId,
    terminalId: r.terminalId ?? null,
    categoryId: r.categoryId,
    amount: r.amount,
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
  constructor(private readonly db: DbExecutor) {}
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
        organizationId: i.organizationId,
        stationId: i.stationId,
        entryDate: i.entryDate,
        fundingAccountId: i.fundingAccountId,
        terminalId: i.terminalId,
        categoryId: i.categoryId,
        amount: i.amount,
        // Office records never touch the Drawer (ADR 0005).
        affectsDrawer: false,
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
      nature: headNatureOf(r.nature),
      taxConfig: (r.taxConfig as Record<string, unknown> | null) ?? null,
      isSystem: r.isSystem,
      isActive: r.isActive,
    };
  }
}

export class DrizzleExpenseHeadRepository implements HeadRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string): Promise<Head | null> {
    const [r] = await this.db
      .select()
      .from(schema.expenseCategories)
      .where(eq(schema.expenseCategories.id, id))
      .limit(1);
    if (!r) return null;
    return {
      id: r.id,
      organizationId: r.organizationId,
      name: r.name,
      nature: headNatureOf(r.nature),
      isSystem: r.isSystem,
    };
  }

  async existsByName(organizationId: string, name: string, excludeId?: string): Promise<boolean> {
    const [r] = await this.db
      .select({ id: schema.expenseCategories.id })
      .from(schema.expenseCategories)
      .where(
        and(
          eq(schema.expenseCategories.organizationId, organizationId),
          sql`lower(${schema.expenseCategories.name}) = ${name.toLowerCase()}`,
          excludeId ? ne(schema.expenseCategories.id, excludeId) : undefined,
        ),
      )
      .limit(1);
    return !!r;
  }

  async save(head: Head): Promise<void> {
    await this.db
      .insert(schema.expenseCategories)
      .values({
        id: head.id,
        organizationId: head.organizationId,
        name: head.name,
        nature: head.nature,
        isSystem: head.isSystem,
      })
      .onConflictDoUpdate({
        target: schema.expenseCategories.id,
        set: { name: head.name, nature: head.nature },
      });
  }
}

export class DrizzleIncomeHeadRepository implements HeadRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string): Promise<Head | null> {
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
      nature: headNatureOf(r.nature),
      isSystem: r.isSystem,
      taxConfig: (r.taxConfig as Record<string, unknown> | null) ?? null,
      isActive: r.isActive,
    };
  }

  async existsByName(organizationId: string, name: string, excludeId?: string): Promise<boolean> {
    const [r] = await this.db
      .select({ id: schema.incomeCategories.id })
      .from(schema.incomeCategories)
      .where(
        and(
          eq(schema.incomeCategories.organizationId, organizationId),
          sql`lower(${schema.incomeCategories.name}) = ${name.toLowerCase()}`,
          excludeId ? ne(schema.incomeCategories.id, excludeId) : undefined,
        ),
      )
      .limit(1);
    return !!r;
  }

  async save(head: Head): Promise<void> {
    const values = {
      name: head.name,
      nature: head.nature,
      taxConfig: head.taxConfig ?? null,
      isActive: head.isActive ?? true,
    };
    await this.db
      .insert(schema.incomeCategories)
      .values({
        id: head.id,
        organizationId: head.organizationId,
        isSystem: head.isSystem,
        ...values,
      })
      .onConflictDoUpdate({ target: schema.incomeCategories.id, set: values });
  }
}
