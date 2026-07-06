import { and, eq, inArray, isNull } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import {
  accountTypeForPaidFrom,
  accountTypeForPaymentMethod,
  DEFAULT_ACCOUNT_NAME,
  type FinancialAccountType,
  type LedgerDirection,
  type LedgerSourceType,
} from '@pump/core';
import { AccountProvisioningService } from './account-provisioning.js';

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

  /** Resolve the target account: an explicitly chosen one (validated to the org),
   *  else the station's system account of the fallback type (created on demand). */
  private async resolveTarget(organizationId: string, stationId: string, explicitId: string | null | undefined, fallbackType: FinancialAccountType): Promise<string> {
    if (explicitId) {
      const rows = await this.db
        .select({ id: schema.financialAccounts.id })
        .from(schema.financialAccounts)
        .where(and(eq(schema.financialAccounts.id, explicitId), eq(schema.financialAccounts.organizationId, organizationId)))
        .limit(1);
      if (rows[0]) return rows[0].id;
    }
    return this.ensureAccount(organizationId, stationId, fallbackType);
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
    accountId?: string | null,
  ): Promise<void> {
    const meta = await this.businessDayMeta(collection.businessDayId);
    if (!meta) return;
    const target = await this.resolveTarget(organizationId, meta.stationId, accountId, accountTypeForPaymentMethod(collection.paymentMethod));
    await this.postEntry({
      organizationId,
      stationId: meta.stationId,
      accountId: target,
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

  /** Expense → money OUT of drawer / petty / bank / owner (chosen account or by paidFrom). */
  async postExpense(
    organizationId: string,
    expense: { id: string; amount: string; paidFrom: string; businessDayId: string; shiftId: string | null },
    accountId?: string | null,
  ): Promise<void> {
    const meta = await this.businessDayMeta(expense.businessDayId);
    if (!meta) return;
    const target = await this.resolveTarget(organizationId, meta.stationId, accountId, accountTypeForPaidFrom(expense.paidFrom));
    await this.postEntry({
      organizationId,
      stationId: meta.stationId,
      accountId: target,
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

  /** Supplier payment → money OUT of drawer / petty / bank / owner (chosen account or by paidFrom). */
  async postSupplierPayment(
    organizationId: string,
    txn: { id: string; amount: string; paidFrom: string; businessDayId: string; shiftId: string | null },
    accountId?: string | null,
  ): Promise<void> {
    const meta = await this.businessDayMeta(txn.businessDayId);
    if (!meta) return;
    const target = await this.resolveTarget(organizationId, meta.stationId, accountId, accountTypeForPaidFrom(txn.paidFrom));
    await this.postEntry({
      organizationId,
      stationId: meta.stationId,
      accountId: target,
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

  // ---- FA3: shift-close sales posting -------------------------------------

  /** Ledger source types produced by shift close (used for idempotent replace). */
  private readonly SHIFT_CLOSE_SOURCES = ['SALE_CASH', 'SALE_CARD'] as const;

  /** Remove any prior shift-close postings for a shift (idempotent re-close / reopen). */
  async reverseShiftClose(shiftId: string): Promise<void> {
    await this.db
      .delete(schema.ledgerEntries)
      .where(and(eq(schema.ledgerEntries.shiftId, shiftId), inArray(schema.ledgerEntries.sourceType, this.SHIFT_CLOSE_SOURCES as unknown as string[])));
  }

  /**
   * Post a closed shift's sales money (FA3): cash-to-drawer → Cash in Hand,
   * card/UPI (declared terminal batches) → Card/UPI Clearing. Credit is a
   * receivable (customer ledger) and is not posted here. Idempotent: prior
   * shift-close postings are replaced, so re-closing after a reopen is safe.
   * Collections/expenses/payments are already posted live (FA2), so they are
   * intentionally excluded to avoid double-counting.
   */
  async postShiftClose(
    organizationId: string,
    shift: { id: string; stationId: string; businessDayId: string },
    recon: { cashSales?: number },
  ): Promise<void> {
    const meta = await this.businessDayMeta(shift.businessDayId);
    const entryDate = meta?.businessDate ?? new Date().toISOString().slice(0, 10);
    const cash = Number(recon.cashSales ?? 0);

    // Card/UPI is captured per terminal; route each terminal's batch to its
    // acquirer's clearing account (many terminals of one acquirer → one account).
    const termEntries = await this.db
      .select({
        card: schema.handoverTerminalEntries.cardAmount,
        upi: schema.handoverTerminalEntries.upiAmount,
        clearingAccountId: schema.paymentTerminals.clearingAccountId,
        provider: schema.paymentTerminals.provider,
      })
      .from(schema.handoverTerminalEntries)
      .innerJoin(schema.paymentTerminals, eq(schema.paymentTerminals.id, schema.handoverTerminalEntries.terminalId))
      .where(eq(schema.handoverTerminalEntries.shiftId, shift.id));

    const provisioner = new AccountProvisioningService(this.db);
    const byClearing = new Map<string, number>();
    for (const e of termEntries) {
      const amt = Number(e.card ?? 0) + Number(e.upi ?? 0);
      if (amt <= 0) continue;
      const accountId = e.clearingAccountId ?? (await provisioner.ensureClearingForProvider(organizationId, shift.stationId, e.provider));
      byClearing.set(accountId, (byClearing.get(accountId) ?? 0) + amt);
    }

    // Fallback: aggregate card/UPI declared on the handover without a per-terminal
    // split (legacy / single-acquirer). Route to the station's clearing account.
    if (byClearing.size === 0) {
      const handovers = await this.db
        .select({ card: schema.attendantHandovers.cardHandedOver, upi: schema.attendantHandovers.upiHandedOver })
        .from(schema.attendantHandovers)
        .where(eq(schema.attendantHandovers.shiftId, shift.id));
      const cardUpi = handovers.reduce((acc, h) => acc + Number(h.card ?? 0) + Number(h.upi ?? 0), 0);
      if (cardUpi > 0) {
        // Card/UPI money implies a machine was used → create a clearing account if
        // none exists yet (money-driven, not a pre-provisioned empty bucket).
        const existing = await this.db
          .select({ id: schema.financialAccounts.id })
          .from(schema.financialAccounts)
          .where(and(eq(schema.financialAccounts.organizationId, organizationId), eq(schema.financialAccounts.stationId, shift.stationId), eq(schema.financialAccounts.accountType, 'MERCHANT_CLEARING')))
          .orderBy(schema.financialAccounts.createdAt)
          .limit(1);
        const accountId = existing[0]?.id ?? (await provisioner.ensureClearingForProvider(organizationId, shift.stationId, null));
        byClearing.set(accountId, cardUpi);
      }
    }

    await this.reverseShiftClose(shift.id);

    if (cash > 0) {
      const cashAccount = await this.ensureAccount(organizationId, shift.stationId, 'CASH_IN_HAND');
      await this.postEntry({
        organizationId,
        stationId: shift.stationId,
        accountId: cashAccount,
        direction: 'in',
        amount: String(cash),
        entryDate,
        sourceType: 'SALE_CASH',
        sourceId: shift.id,
        businessDayId: shift.businessDayId,
        shiftId: shift.id,
        notes: 'Shift cash sales',
      });
    }

    for (const [accountId, amount] of byClearing) {
      await this.postEntry({
        organizationId,
        stationId: shift.stationId,
        accountId,
        direction: 'in',
        amount: String(amount),
        entryDate,
        sourceType: 'SALE_CARD',
        sourceId: shift.id,
        businessDayId: shift.businessDayId,
        shiftId: shift.id,
        notes: 'Shift card/UPI (terminal batch)',
      });
    }
  }
}
