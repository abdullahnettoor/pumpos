import { and, eq, isNull } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import {
  accountTypeForPaidFrom,
  accountTypeForPaymentMethod,
  DEFAULT_ACCOUNT_NAME,
  type FinancialAccountType,
  type LedgerDirection,
  type LedgerSourceType,
} from '@pump/core';

/**
 * Posts money movements onto the persisted ledger (Phase F, FA2). Called inside
 * the same transaction as the originating use-case, right after it succeeds, so
 * a posting failure rolls back the whole operation.
 *
 * System accounts (Cash in Hand / Bank / Owner …) are provisioned lazily per
 * station on first use — no manual setup needed to start; they can be renamed or
 * extended (extra banks, petty cash) later via the accounts UI.
 */
export class LedgerPostingService {
  constructor(private readonly db: DbClient) {}

  private async businessDayMeta(businessDayId: string): Promise<{ stationId: string; businessDate: string } | null> {
    const rows = await this.db
      .select({ stationId: schema.businessDays.stationId, businessDate: schema.businessDays.businessDate })
      .from(schema.businessDays)
      .where(eq(schema.businessDays.id, businessDayId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Find (or lazily create) the station's system account of a given type. */
  private async ensureAccount(organizationId: string, stationId: string, type: FinancialAccountType): Promise<string> {
    const existing = await this.db
      .select({ id: schema.financialAccounts.id })
      .from(schema.financialAccounts)
      .where(
        and(
          eq(schema.financialAccounts.organizationId, organizationId),
          eq(schema.financialAccounts.stationId, stationId),
          eq(schema.financialAccounts.accountType, type),
        ),
      )
      .orderBy(schema.financialAccounts.createdAt)
      .limit(1);
    if (existing[0]) return existing[0].id;

    // Fall back to an org-shared (station-less) account of this type if one exists.
    const shared = await this.db
      .select({ id: schema.financialAccounts.id })
      .from(schema.financialAccounts)
      .where(
        and(
          eq(schema.financialAccounts.organizationId, organizationId),
          isNull(schema.financialAccounts.stationId),
          eq(schema.financialAccounts.accountType, type),
        ),
      )
      .limit(1);
    if (shared[0]) return shared[0].id;

    const [created] = await this.db
      .insert(schema.financialAccounts)
      .values({
        organizationId,
        stationId,
        accountType: type,
        name: DEFAULT_ACCOUNT_NAME[type],
        openingBalance: '0',
        openingDate: null,
        isActive: true,
      })
      .returning({ id: schema.financialAccounts.id });
    return created.id;
  }

  private async postEntry(params: {
    organizationId: string;
    stationId: string;
    accountId: string;
    direction: LedgerDirection;
    amount: string;
    entryDate: string;
    sourceType: LedgerSourceType;
    sourceId: string;
    businessDayId: string;
    shiftId: string | null;
    notes?: string | null;
  }): Promise<void> {
    if (!(Number(params.amount) > 0)) return; // never post a zero/blank movement
    await this.db.insert(schema.ledgerEntries).values({
      organizationId: params.organizationId,
      stationId: params.stationId,
      accountId: params.accountId,
      direction: params.direction,
      amount: params.amount,
      entryDate: params.entryDate,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      transferId: null,
      businessDayId: params.businessDayId,
      shiftId: params.shiftId,
      reconciled: false,
      notes: params.notes ?? null,
    });
  }

  /** Customer collection → money IN (cash → drawer, else bank). */
  async postCollection(
    organizationId: string,
    collection: { id: string; amount: string; paymentMethod: string; businessDayId: string; shiftId: string | null },
  ): Promise<void> {
    const meta = await this.businessDayMeta(collection.businessDayId);
    if (!meta) return;
    const type = accountTypeForPaymentMethod(collection.paymentMethod);
    const accountId = await this.ensureAccount(organizationId, meta.stationId, type);
    await this.postEntry({
      organizationId,
      stationId: meta.stationId,
      accountId,
      direction: 'in',
      amount: collection.amount,
      entryDate: meta.businessDate,
      sourceType: 'COLLECTION',
      sourceId: collection.id,
      businessDayId: collection.businessDayId,
      shiftId: collection.shiftId,
      notes: `Collection (${collection.paymentMethod})`,
    });
  }

  /** Expense → money OUT of drawer / bank / owner (by paidFrom). */
  async postExpense(
    organizationId: string,
    expense: { id: string; amount: string; paidFrom: string; businessDayId: string; shiftId: string | null },
  ): Promise<void> {
    const meta = await this.businessDayMeta(expense.businessDayId);
    if (!meta) return;
    const type = accountTypeForPaidFrom(expense.paidFrom);
    const accountId = await this.ensureAccount(organizationId, meta.stationId, type);
    await this.postEntry({
      organizationId,
      stationId: meta.stationId,
      accountId,
      direction: 'out',
      amount: expense.amount,
      entryDate: meta.businessDate,
      sourceType: 'EXPENSE',
      sourceId: expense.id,
      businessDayId: expense.businessDayId,
      shiftId: expense.shiftId,
      notes: 'Expense',
    });
  }

  /** Supplier payment → money OUT of drawer / bank / owner (by paidFrom). */
  async postSupplierPayment(
    organizationId: string,
    txn: { id: string; amount: string; paidFrom: string; businessDayId: string; shiftId: string | null },
  ): Promise<void> {
    const meta = await this.businessDayMeta(txn.businessDayId);
    if (!meta) return;
    const type = accountTypeForPaidFrom(txn.paidFrom);
    const accountId = await this.ensureAccount(organizationId, meta.stationId, type);
    await this.postEntry({
      organizationId,
      stationId: meta.stationId,
      accountId,
      direction: 'out',
      amount: txn.amount,
      entryDate: meta.businessDate,
      sourceType: 'SUPPLIER_PAYMENT',
      sourceId: txn.id,
      businessDayId: txn.businessDayId,
      shiftId: txn.shiftId,
      notes: 'Supplier payment',
    });
  }
}
