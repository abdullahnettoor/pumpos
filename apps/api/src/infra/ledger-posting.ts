import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import {
  accountTypeForPaidFrom,
  accountTypeForPaymentMethod,
  DEFAULT_ACCOUNT_NAME,
  type FinancialAccountType,
  type LedgerDirection,
  type LedgerSourceType,
} from '@pump/core';
import { normalizeProvider } from '@pump/shared';

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

  private async businessDayMeta(
    businessDayId: string,
  ): Promise<{ stationId: string; businessDate: string } | null> {
    const rows = await this.db
      .select({
        stationId: schema.businessDays.stationId,
        businessDate: schema.businessDays.businessDate,
      })
      .from(schema.businessDays)
      .where(eq(schema.businessDays.id, businessDayId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Find (or lazily create) the station's system account of a given type. */
  private async ensureAccount(
    organizationId: string,
    stationId: string,
    type: FinancialAccountType,
  ): Promise<string> {
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
  private async resolveTarget(
    organizationId: string,
    stationId: string,
    explicitId: string | null | undefined,
    fallbackType: FinancialAccountType,
  ): Promise<string> {
    if (explicitId) {
      const rows = await this.db
        .select({ id: schema.financialAccounts.id })
        .from(schema.financialAccounts)
        .where(
          and(
            eq(schema.financialAccounts.id, explicitId),
            eq(schema.financialAccounts.organizationId, organizationId),
          ),
        )
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
    collection: {
      id: string;
      amount: string;
      paymentMethod: string;
      businessDayId: string;
      shiftId: string | null;
    },
    accountId?: string | null,
  ): Promise<void> {
    const meta = await this.businessDayMeta(collection.businessDayId);
    if (!meta) return;
    const target = await this.resolveTarget(
      organizationId,
      meta.stationId,
      accountId,
      accountTypeForPaymentMethod(collection.paymentMethod),
    );
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
    expense: {
      id: string;
      amount: string;
      paidFrom: string;
      businessDayId: string;
      shiftId: string | null;
    },
    accountId?: string | null,
  ): Promise<void> {
    const meta = await this.businessDayMeta(expense.businessDayId);
    if (!meta) return;
    const target = await this.resolveTarget(
      organizationId,
      meta.stationId,
      accountId,
      accountTypeForPaidFrom(expense.paidFrom),
    );
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

  /** Other/indirect income → money IN to drawer / bank / owner (by receivedInto). */
  async postIncome(
    organizationId: string,
    income: {
      id: string;
      amount: string;
      receivedInto: string;
      businessDayId: string;
      shiftId: string | null;
    },
    accountId?: string | null,
  ): Promise<void> {
    const meta = await this.businessDayMeta(income.businessDayId);
    if (!meta) return;
    const target = await this.resolveTarget(
      organizationId,
      meta.stationId,
      accountId,
      accountTypeForPaidFrom(income.receivedInto),
    );
    await this.postEntry({
      organizationId,
      stationId: meta.stationId,
      accountId: target,
      direction: 'in',
      amount: income.amount,
      entryDate: meta.businessDate,
      sourceType: 'INCOME',
      sourceId: income.id,
      businessDayId: income.businessDayId,
      shiftId: income.shiftId,
      notes: 'Other income',
    });
  }

  /** Supplier payment → money OUT of drawer / petty / bank / owner (chosen account or by paidFrom). */
  async postSupplierPayment(
    organizationId: string,
    txn: {
      id: string;
      amount: string;
      paidFrom: string;
      businessDayId: string;
      shiftId: string | null;
    },
    accountId?: string | null,
  ): Promise<void> {
    const meta = await this.businessDayMeta(txn.businessDayId);
    if (!meta) return;
    const target = await this.resolveTarget(
      organizationId,
      meta.stationId,
      accountId,
      accountTypeForPaidFrom(txn.paidFrom),
    );
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

  /** OMC fleet-card sale → money IN to the station's CMS (card-settlement) account.
   *  Not a receivable and not drawer cash: the Oil Company settles the value to
   *  the station's CMS account. Idempotent per sale id (reversible on void).
   *  The ledger note carries the selected customer's identity when one is linked,
   *  otherwise the free-text remarks captured on the sale (so an anonymous OMC
   *  swipe still keeps its slip/driver details). */
  async postOmcCardSale(
    organizationId: string,
    sale: {
      id: string;
      amount: string;
      businessDayId: string;
      shiftId: string | null;
      customerId?: string | null;
      notes?: string | null;
    },
  ): Promise<void> {
    const meta = await this.businessDayMeta(sale.businessDayId);
    if (!meta) return;
    const target = await this.ensureAccount(organizationId, meta.stationId, 'CMS');

    let note = 'OMC card';
    if (sale.customerId) {
      const [cust] = await this.db
        .select({ name: schema.customers.name, fleetCode: schema.customers.fleetCode })
        .from(schema.customers)
        .where(eq(schema.customers.id, sale.customerId))
        .limit(1);
      const label = cust
        ? `${cust.name}${cust.fleetCode ? ` (${cust.fleetCode})` : ''}`
        : 'Customer';
      note = `OMC card · ${label}`;
      if (sale.notes) note += ` · ${sale.notes}`;
    } else if (sale.notes) {
      note = `OMC card · ${sale.notes}`;
    }

    await this.postEntry({
      organizationId,
      stationId: meta.stationId,
      accountId: target,
      direction: 'in',
      amount: sale.amount,
      entryDate: meta.businessDate,
      sourceType: 'SALE_OMC',
      sourceId: sale.id,
      businessDayId: sale.businessDayId,
      shiftId: sale.shiftId,
      notes: note,
    });
  }

  /** Reverse the CMS money-in for a voided OMC card sale. */
  async reverseOmcCardSale(sourceId: string): Promise<void> {
    await this.db
      .delete(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.sourceType, 'SALE_OMC'),
          eq(schema.ledgerEntries.sourceId, sourceId),
        ),
      );
  }

  /** Reverse the money-out for a voided expense. */
  async reverseExpense(sourceId: string): Promise<void> {
    await this.db
      .delete(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.sourceType, 'EXPENSE'),
          eq(schema.ledgerEntries.sourceId, sourceId),
        ),
      );
  }

  /** Reverse the money-in for a voided income entry. */
  async reverseIncome(sourceId: string): Promise<void> {
    await this.db
      .delete(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.sourceType, 'INCOME'),
          eq(schema.ledgerEntries.sourceId, sourceId),
        ),
      );
  }

  // ---- FA3: shift-close sales posting -------------------------------------

  /** Ledger source types produced by shift close (used for idempotent replace). */
  private readonly SHIFT_CLOSE_SOURCES = ['SALE_CASH', 'SALE_CARD'] as const;

  /** Remove any prior shift-close postings for a shift (idempotent re-close / reopen). */
  async reverseShiftClose(shiftId: string): Promise<void> {
    await this.db
      .delete(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.shiftId, shiftId),
          inArray(schema.ledgerEntries.sourceType, this.SHIFT_CLOSE_SOURCES as unknown as string[]),
        ),
      );
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
    const cash = Number(recon.cashSales ?? 0);

    // Card/UPI is captured per terminal; post ONE ledger entry per machine to
    // its acquirer's clearing account, so each machine's batch is visible.
    // Statement-budget shape (#229): one combined read for the entry date, the
    // terminal entries, the handover card/UPI fallback aggregate, and every
    // candidate account — then at most one batched account insert (cold path)
    // and one delete+insert ledger write.
    const [read] = (await this.db.execute(sql`
      SELECT
        (SELECT d.business_date FROM business_days d
          WHERE d.id = ${shift.businessDayId}) AS business_date,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'card', e.card_amount::text,
            'upi', e.upi_amount::text,
            'clearingAccountId', pt.clearing_account_id,
            'provider', pt.provider,
            'label', pt.label
          ))
          FROM handover_terminal_entries e
          JOIN payment_terminals pt ON pt.id = e.terminal_id
          WHERE e.shift_id = ${shift.id}), '[]'::jsonb) AS term_entries,
        (SELECT COALESCE(SUM(COALESCE(h.card_handed_over, 0) + COALESCE(h.upi_handed_over, 0)), 0)::float8
          FROM attendant_handovers h WHERE h.shift_id = ${shift.id}) AS handover_card_upi,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', fa.id,
            'stationId', fa.station_id,
            'accountType', fa.account_type,
            'provider', fa.metadata->>'provider'
          ) ORDER BY fa.created_at)
          FROM financial_accounts fa
          WHERE fa.organization_id = ${organizationId}
            AND (fa.station_id = ${shift.stationId} OR fa.station_id IS NULL)
            AND fa.account_type IN ('CASH_IN_HAND', 'MERCHANT_CLEARING')), '[]'::jsonb) AS accounts
    `)) as unknown as [Record<string, any>];

    const entryDate: string =
      (read.business_date as string | null) ?? new Date().toISOString().slice(0, 10);
    const termEntries: Array<{
      card: string | null;
      upi: string | null;
      clearingAccountId: string | null;
      provider: string | null;
      label: string | null;
    }> = read.term_entries ?? [];
    const accounts: Array<{
      id: string;
      stationId: string | null;
      accountType: string;
      provider: string | null;
    }> = read.accounts ?? [];

    // In-memory account resolution mirroring ensureAccount / ensureClearingForProvider:
    // station-scoped first (oldest), org-shared fallback for CASH_IN_HAND, provider
    // matched case-insensitively for clearing. Missing accounts are collected and
    // created in ONE batched insert (first-ever close only).
    const stationClearing = accounts.filter(
      (a) => a.accountType === 'MERCHANT_CLEARING' && a.stationId === shift.stationId,
    );
    const toCreate: Array<{ key: string; name: string; metadata: { provider: string } | null }> =
      [];
    const pendingKeys = new Map<string, string>(); // resolution key -> toCreate key
    const clearingFor = (providerRaw: string | null | undefined): string | { pending: string } => {
      const prov = normalizeProvider(providerRaw);
      if (prov) {
        const match = stationClearing.find(
          (a) => (a.provider ?? '').toLowerCase() === prov.toLowerCase(),
        );
        if (match) return match.id;
        const key = `clearing:${prov.toLowerCase()}`;
        if (!pendingKeys.has(key)) {
          pendingKeys.set(key, key);
          toCreate.push({ key, name: `${prov} Clearing`, metadata: { provider: prov } });
        }
        return { pending: key };
      }
      const def = stationClearing.find((a) => a.provider == null);
      if (def) return def.id;
      const key = 'clearing:__default__';
      if (!pendingKeys.has(key)) {
        pendingKeys.set(key, key);
        toCreate.push({ key, name: DEFAULT_ACCOUNT_NAME.MERCHANT_CLEARING, metadata: null });
      }
      return { pending: key };
    };

    const cardPosts: Array<{
      account: string | { pending: string };
      amount: number;
      note: string;
    }> = [];
    for (const e of termEntries) {
      const amt = Number(e.card ?? 0) + Number(e.upi ?? 0);
      if (amt <= 0) continue;
      const account = e.clearingAccountId ?? clearingFor(e.provider);
      cardPosts.push({ account, amount: amt, note: `Shift card/UPI · ${e.label || 'terminal'}` });
    }

    // Fallback: aggregate card/UPI declared on the handover without a per-terminal
    // split (legacy / single-acquirer). Route to the station's clearing account.
    if (cardPosts.length === 0) {
      const cardUpi = Number(read.handover_card_upi ?? 0);
      if (cardUpi > 0) {
        // Card/UPI money implies a machine was used → create a clearing account if
        // none exists yet (money-driven, not a pre-provisioned empty bucket).
        const account = stationClearing[0]?.id ?? clearingFor(null);
        cardPosts.push({ account, amount: cardUpi, note: 'Shift card/UPI (terminal batch)' });
      }
    }

    let cashAccount: string | { pending: string } | null = null;
    if (cash > 0) {
      const stationCash = accounts.find(
        (a) => a.accountType === 'CASH_IN_HAND' && a.stationId === shift.stationId,
      );
      const sharedCash = accounts.find(
        (a) => a.accountType === 'CASH_IN_HAND' && a.stationId === null,
      );
      if (stationCash) cashAccount = stationCash.id;
      else if (sharedCash) cashAccount = sharedCash.id;
      else {
        const key = 'cash:__default__';
        if (!pendingKeys.has(key)) {
          pendingKeys.set(key, key);
          toCreate.push({ key, name: DEFAULT_ACCOUNT_NAME.CASH_IN_HAND, metadata: null });
        }
        cashAccount = { pending: key };
      }
    }

    // Cold path: create every missing account in one statement.
    const createdByKey = new Map<string, string>();
    if (toCreate.length > 0) {
      const created = await this.db
        .insert(schema.financialAccounts)
        .values(
          toCreate.map((t) => ({
            organizationId,
            stationId: shift.stationId,
            accountType: t.key.startsWith('cash:') ? 'CASH_IN_HAND' : 'MERCHANT_CLEARING',
            name: t.name,
            openingBalance: '0',
            openingDate: null,
            metadata: t.metadata,
            isActive: true,
          })),
        )
        .returning({ id: schema.financialAccounts.id, name: schema.financialAccounts.name });
      // RETURNING row order is not formally guaranteed to match VALUES order,
      // and these ids route money — match by (unique-per-batch) account name.
      const idByName = new Map(created.map((c) => [c.name, c.id]));
      for (const t of toCreate) createdByKey.set(t.key, idByName.get(t.name)!);
    }
    const resolve = (a: string | { pending: string }): string =>
      typeof a === 'string' ? a : createdByKey.get(a.pending)!;

    const entryBase = {
      organizationId,
      stationId: shift.stationId,
      entryDate,
      sourceId: shift.id,
      businessDayId: shift.businessDayId,
      shiftId: shift.id,
      reconciled: false,
    };
    const values = [
      ...(cash > 0 && cashAccount
        ? [
            {
              ...entryBase,
              accountId: resolve(cashAccount),
              direction: 'in',
              amount: String(cash),
              sourceType: 'SALE_CASH',
              notes: 'Shift cash sales',
            },
          ]
        : []),
      ...cardPosts
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({
          ...entryBase,
          accountId: resolve(p.account),
          direction: 'in',
          amount: String(p.amount),
          sourceType: 'SALE_CARD',
          notes: p.note,
        })),
    ];
    // Replace prior shift-close postings and write the new ones in ONE
    // data-modifying-CTE statement (idempotent re-close / reopen).
    const removal = sql`
      DELETE FROM ledger_entries
      WHERE shift_id = ${shift.id} AND source_type IN ('SALE_CASH', 'SALE_CARD')
    `;
    if (values.length === 0) {
      await this.db.execute(removal);
      return;
    }
    const rows = sql.join(
      values.map(
        (v) => sql`(
          ${v.organizationId}, ${v.stationId}, ${v.accountId}::uuid, ${v.direction},
          ${v.amount}::numeric, ${v.entryDate}, ${v.sourceType}, ${v.sourceId},
          ${v.businessDayId}, ${v.shiftId}, false, ${v.notes}
        )`,
      ),
      sql`, `,
    );
    await this.db.execute(sql`
      WITH removed AS (${removal})
      INSERT INTO ledger_entries (
        organization_id, station_id, account_id, direction, amount, entry_date,
        source_type, source_id, business_day_id, shift_id, reconciled, notes
      ) VALUES ${rows}
    `);
  }
}
