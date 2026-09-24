import { eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { accountTypeForPaidFrom } from '@pump/core';
import type {
  Expense,
  ExpenseRepository,
  OtherIncome,
  IncomeRepository,
  IncomeCategory,
  IncomeCategoryRepository,
} from '@pump/core';
import { resolveOfficeColumns } from '../office-anchor.js';

// TODO(#273): the office tables dropped shift_id / business_day_id / paid_from /
// received_into (ADR 0005, #280). Until the office use-cases move to the new
// entry-date model, the legacy anchor fields are stashed in metadata so the
// domain entities round-trip unchanged.
type LegacyMeta = Record<string, unknown>;

function toExpense(r: typeof schema.expenses.$inferSelect): Expense {
  const meta = (r.metadata as LegacyMeta) ?? {};
  return {
    id: r.id,
    shiftId: (meta.shiftId as string | null) ?? null, // TODO(#273)
    businessDayId: (meta.businessDayId as string) ?? '', // TODO(#273)
    categoryId: r.categoryId,
    amount: r.amount,
    paidFrom: ((meta.paidFrom as string) ?? 'SHIFT_CASH') as Expense['paidFrom'], // TODO(#273)
    affectsDrawer: r.affectsDrawer,
    description: r.description ?? null,
    status: r.status,
    metadata: meta,
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
    // TODO(#273): derive the new not-null office columns from the legacy anchor.
    const cols = await resolveOfficeColumns(
      this.db,
      e.businessDayId,
      accountTypeForPaidFrom(e.paidFrom),
    );
    const metadata: LegacyMeta = {
      ...(e.metadata ?? {}),
      shiftId: e.shiftId,
      businessDayId: e.businessDayId,
      paidFrom: e.paidFrom,
    };
    await this.db
      .insert(schema.expenses)
      .values({
        id: e.id,
        organizationId: cols.organizationId,
        stationId: cols.stationId,
        entryDate: cols.entryDate,
        fundingAccountId: cols.fundingAccountId,
        categoryId: e.categoryId,
        amount: e.amount,
        affectsDrawer: e.affectsDrawer,
        description: e.description,
        status: e.status,
        metadata,
        createdAt: new Date(e.createdAt),
        updatedAt: new Date(e.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.expenses.id,
        set: {
          amount: e.amount,
          affectsDrawer: e.affectsDrawer,
          description: e.description,
          status: e.status,
          metadata,
          updatedAt: new Date(e.updatedAt),
        },
      });
  }
}

function toIncome(r: typeof schema.otherIncome.$inferSelect): OtherIncome {
  const meta = (r.metadata as LegacyMeta) ?? {};
  return {
    id: r.id,
    shiftId: (meta.shiftId as string | null) ?? null, // TODO(#273)
    businessDayId: (meta.businessDayId as string) ?? '', // TODO(#273)
    categoryId: r.categoryId,
    amount: r.amount,
    receivedInto: ((meta.receivedInto as string) ?? 'SHIFT_CASH') as OtherIncome['receivedInto'], // TODO(#273)
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
    // TODO(#273): derive the new not-null office columns from the legacy anchor.
    const cols = await resolveOfficeColumns(
      this.db,
      i.businessDayId,
      accountTypeForPaidFrom(i.receivedInto),
    );
    const metadata: LegacyMeta = {
      ...(i.metadata ?? {}),
      shiftId: i.shiftId,
      businessDayId: i.businessDayId,
      receivedInto: i.receivedInto,
    };
    await this.db
      .insert(schema.otherIncome)
      .values({
        id: i.id,
        organizationId: cols.organizationId,
        stationId: cols.stationId,
        entryDate: cols.entryDate,
        fundingAccountId: cols.fundingAccountId,
        categoryId: i.categoryId,
        amount: i.amount,
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
        metadata,
        createdAt: new Date(i.createdAt),
        updatedAt: new Date(i.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.otherIncome.id,
        set: {
          amount: i.amount,
          affectsDrawer: i.affectsDrawer,
          payer: i.payer,
          description: i.description,
          status: i.status,
          metadata,
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
