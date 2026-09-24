import { and, asc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { AccountProvisioningService } from '../account-provisioning.js';
import type {
  OfficePaymentTerminal,
  PaymentTerminalLookup,
  FinancialAccount,
  FinancialAccountRepository,
  LedgerEntry,
  LedgerEntryRepository,
} from '@pump/core';

type AccountRow = typeof schema.financialAccounts.$inferSelect;
type EntryRow = typeof schema.ledgerEntries.$inferSelect;

const toAccount = (r: AccountRow): FinancialAccount => ({
  id: r.id,
  organizationId: r.organizationId,
  stationId: r.stationId,
  accountType: r.accountType as FinancialAccount['accountType'],
  name: r.name,
  openingBalance: r.openingBalance,
  openingDate: r.openingDate,
  metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  isActive: r.isActive,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const toEntry = (r: EntryRow): LedgerEntry => ({
  id: r.id,
  organizationId: r.organizationId,
  stationId: r.stationId,
  accountId: r.accountId,
  direction: r.direction as LedgerEntry['direction'],
  amount: r.amount,
  entryDate: r.entryDate,
  sourceType: r.sourceType as LedgerEntry['sourceType'],
  sourceId: r.sourceId,
  transferId: r.transferId,
  businessDayId: r.businessDayId,
  shiftId: r.shiftId,
  reconciled: r.reconciled,
  notes: r.notes,
  createdAt: r.createdAt.toISOString(),
});

export class DrizzleFinancialAccountRepository implements FinancialAccountRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string): Promise<FinancialAccount | null> {
    const rows = await this.db
      .select()
      .from(schema.financialAccounts)
      .where(eq(schema.financialAccounts.id, id))
      .limit(1);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async existsByName(
    organizationId: string,
    stationId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    const conds = [
      eq(schema.financialAccounts.organizationId, organizationId),
      stationId
        ? eq(schema.financialAccounts.stationId, stationId)
        : isNull(schema.financialAccounts.stationId),
      sql`lower(${schema.financialAccounts.name}) = lower(${name})`,
      ...(excludeId ? [ne(schema.financialAccounts.id, excludeId)] : []),
    ];
    const rows = await this.db
      .select({ id: schema.financialAccounts.id })
      .from(schema.financialAccounts)
      .where(and(...conds))
      .limit(1);
    return rows.length > 0;
  }

  async save(a: FinancialAccount): Promise<void> {
    await this.db
      .insert(schema.financialAccounts)
      .values({
        id: a.id,
        organizationId: a.organizationId,
        stationId: a.stationId,
        accountType: a.accountType,
        name: a.name,
        openingBalance: a.openingBalance,
        openingDate: a.openingDate,
        metadata: a.metadata,
        isActive: a.isActive,
        createdAt: new Date(a.createdAt),
        updatedAt: new Date(a.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.financialAccounts.id,
        set: {
          name: a.name,
          openingBalance: a.openingBalance,
          openingDate: a.openingDate,
          metadata: a.metadata,
          isActive: a.isActive,
          updatedAt: new Date(a.updatedAt),
        },
      });
  }
}

export class DrizzleLedgerEntryRepository implements LedgerEntryRepository {
  constructor(private readonly db: DbClient) {}

  async saveMany(entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db.insert(schema.ledgerEntries).values(
      entries.map((e) => ({
        id: e.id,
        organizationId: e.organizationId,
        stationId: e.stationId,
        accountId: e.accountId,
        direction: e.direction,
        amount: e.amount,
        entryDate: e.entryDate,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        transferId: e.transferId,
        businessDayId: e.businessDayId,
        shiftId: e.shiftId,
        reconciled: e.reconciled,
        notes: e.notes,
        createdAt: new Date(e.createdAt),
      })),
    );
  }

  async deleteByAccountAndSource(
    accountId: string,
    sourceType: LedgerEntry['sourceType'],
  ): Promise<void> {
    await this.db
      .delete(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.accountId, accountId),
          eq(schema.ledgerEntries.sourceType, sourceType),
        ),
      );
  }
}

export interface AccountWithBalance extends FinancialAccount {
  balance: string;
}

/**
 * Read model for money accounts. Balances are derived purely from ledger_entries
 * (the opening balance is itself an OPENING entry when non-zero), so
 * balance = Σin − Σout.
 */
export class DrizzleFinancialAccountReader {
  constructor(private readonly db: DbClient) {}

  async listWithBalances(
    organizationId: string,
    stationId?: string | null,
  ): Promise<AccountWithBalance[]> {
    const conds = [eq(schema.financialAccounts.organizationId, organizationId)];
    if (stationId) conds.push(eq(schema.financialAccounts.stationId, stationId));
    const rows = await this.db
      .select({
        account: schema.financialAccounts,
        balance: sql<string>`COALESCE(SUM(CASE WHEN ${schema.ledgerEntries.direction} = 'in' THEN ${schema.ledgerEntries.amount} ELSE -${schema.ledgerEntries.amount} END), 0)`,
      })
      .from(schema.financialAccounts)
      .leftJoin(
        schema.ledgerEntries,
        eq(schema.ledgerEntries.accountId, schema.financialAccounts.id),
      )
      .where(and(...conds))
      .groupBy(schema.financialAccounts.id)
      .orderBy(asc(schema.financialAccounts.accountType), asc(schema.financialAccounts.name));
    return rows.map((r) => ({ ...toAccount(r.account), balance: String(r.balance) }));
  }

  /**
   * Active accounts an Office Record at this station may move money through
   * (station accounts + organization-shared ones). No balances: this backs the
   * Funding Account picker, which any office role may use (ADR 0005).
   */
  async listFundingAccounts(
    organizationId: string,
    stationId: string,
  ): Promise<Array<{ id: string; name: string; accountType: string; stationId: string | null }>> {
    return this.db
      .select({
        id: schema.financialAccounts.id,
        name: schema.financialAccounts.name,
        accountType: schema.financialAccounts.accountType,
        stationId: schema.financialAccounts.stationId,
      })
      .from(schema.financialAccounts)
      .where(
        and(
          eq(schema.financialAccounts.organizationId, organizationId),
          eq(schema.financialAccounts.isActive, true),
          sql`(${schema.financialAccounts.stationId} = ${stationId} OR ${schema.financialAccounts.stationId} IS NULL)`,
        ),
      )
      .orderBy(asc(schema.financialAccounts.accountType), asc(schema.financialAccounts.name));
  }

  /**
   * Daily Cash Book (ADR 0005): for one station-timezone date, every account's
   * opening (Σ before the date), money in, money out and closing, plus the
   * day's entries. Computed live from ledger_entries — never a snapshot.
   */
  async dailyCashBook(
    organizationId: string,
    stationId: string,
    date: string,
  ): Promise<{
    date: string;
    accounts: Array<{
      id: string;
      name: string;
      accountType: string;
      opening: number;
      moneyIn: number;
      moneyOut: number;
      closing: number;
      entries: Array<{
        id: string;
        direction: string;
        amount: number;
        sourceType: string;
        sourceId: string | null;
        notes: string | null;
        createdAt: string;
      }>;
    }>;
  }> {
    const rows = (await this.db.execute(sql`
      SELECT
        fa.id, fa.name, fa.account_type AS "accountType",
        COALESCE(SUM(CASE WHEN le.entry_date < ${date}
          THEN CASE WHEN le.direction = 'in' THEN le.amount ELSE -le.amount END END), 0)::float8 AS opening,
        COALESCE(SUM(CASE WHEN le.entry_date = ${date} AND le.direction = 'in'
          THEN le.amount END), 0)::float8 AS "moneyIn",
        COALESCE(SUM(CASE WHEN le.entry_date = ${date} AND le.direction = 'out'
          THEN le.amount END), 0)::float8 AS "moneyOut",
        COALESCE(jsonb_agg(jsonb_build_object(
            'id', le.id,
            'direction', le.direction,
            'amount', le.amount::float8,
            'sourceType', le.source_type,
            'sourceId', le.source_id,
            'notes', le.notes,
            'createdAt', le.created_at
          ) ORDER BY le.created_at, le.id) FILTER (WHERE le.entry_date = ${date}), '[]'::jsonb) AS entries
      FROM financial_accounts fa
      LEFT JOIN ledger_entries le ON le.account_id = fa.id AND le.entry_date <= ${date}
      WHERE fa.organization_id = ${organizationId}
        AND (fa.station_id = ${stationId} OR fa.station_id IS NULL)
      GROUP BY fa.id
      -- An inactive account still shows while it holds money or moved some.
      HAVING fa.is_active OR COUNT(le.id) > 0
      ORDER BY fa.account_type, fa.name
    `)) as unknown as Array<{
      id: string;
      name: string;
      accountType: string;
      opening: number;
      moneyIn: number;
      moneyOut: number;
      entries: any[];
    }>;
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    return {
      date,
      accounts: rows.map((r) => ({
        ...r,
        opening: r2(r.opening),
        moneyIn: r2(r.moneyIn),
        moneyOut: r2(r.moneyOut),
        closing: r2(r.opening + r.moneyIn - r.moneyOut),
      })),
    };
  }

  /** Account statement: period-opening balance (Σ before `from`) + entries in [from,to]. */
  async accountLedger(
    organizationId: string,
    accountId: string,
    from?: string,
    to?: string,
  ): Promise<{ account: FinancialAccount; periodOpeningBalance: string; entries: any[] } | null> {
    const accRows = await this.db
      .select()
      .from(schema.financialAccounts)
      .where(
        and(
          eq(schema.financialAccounts.id, accountId),
          eq(schema.financialAccounts.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!accRows[0]) return null;

    let periodOpeningBalance = '0';
    if (from) {
      const [openRow] = await this.db
        .select({
          bal: sql<string>`COALESCE(SUM(CASE WHEN ${schema.ledgerEntries.direction} = 'in' THEN ${schema.ledgerEntries.amount} ELSE -${schema.ledgerEntries.amount} END), 0)`,
        })
        .from(schema.ledgerEntries)
        .where(
          and(
            eq(schema.ledgerEntries.accountId, accountId),
            sql`${schema.ledgerEntries.entryDate} < ${from}`,
          ),
        );
      periodOpeningBalance = String(openRow?.bal ?? '0');
    }

    const rangeConds = [eq(schema.ledgerEntries.accountId, accountId)];
    if (from) rangeConds.push(gte(schema.ledgerEntries.entryDate, from));
    if (to) rangeConds.push(lte(schema.ledgerEntries.entryDate, to));
    // Enrich each entry with its originating OMC sale (when sourceType is
    // SALE_OMC, sourceId → customer_transactions.id) so the statement can show
    // which customer / vehicle / fuel each CMS receipt came from. Non-OMC rows
    // don't match (UUIDs are globally unique) and simply carry nulls.
    const entryRows = await this.db
      .select({
        e: schema.ledgerEntries,
        omcCustomerName: schema.customers.name,
        omcVehicle: schema.customerVehicles.registrationNumber,
        omcProduct: schema.products.name,
        omcQuantity: schema.customerTransactions.quantity,
        omcNotes: schema.customerTransactions.notes,
      })
      .from(schema.ledgerEntries)
      .leftJoin(
        schema.customerTransactions,
        eq(schema.customerTransactions.id, schema.ledgerEntries.sourceId),
      )
      .leftJoin(schema.customers, eq(schema.customers.id, schema.customerTransactions.customerId))
      .leftJoin(
        schema.customerVehicles,
        eq(schema.customerVehicles.id, schema.customerTransactions.vehicleId),
      )
      .leftJoin(schema.products, eq(schema.products.id, schema.customerTransactions.productId))
      .where(and(...rangeConds))
      .orderBy(asc(schema.ledgerEntries.entryDate), asc(schema.ledgerEntries.createdAt));

    const entries = entryRows.map((r) => ({
      ...toEntry(r.e),
      omcCustomerName: r.omcCustomerName ?? null,
      omcVehicle: r.omcVehicle ?? null,
      omcProduct: r.omcProduct ?? null,
      omcQuantity: r.omcQuantity != null ? Number(r.omcQuantity) : null,
      omcNotes: r.omcNotes ?? null,
    })) as any[];

    return { account: toAccount(accRows[0]), periodOpeningBalance, entries };
  }

  /** Station-wide ledger movements in [from,to], joined with account type/name,
   *  plus per-account-type opening balances (Σ signed in−out for entries dated
   *  before `from`). Backs the repriced Cash & Bank report so its running
   *  balance carries the historical opening instead of starting at zero. */
  async stationMovements(
    organizationId: string,
    stationId: string,
    from?: string,
    to?: string,
  ): Promise<{
    movements: Array<{
      id: string;
      entryDate: string;
      accountId: string;
      accountType: string;
      accountName: string;
      direction: string;
      amount: string;
      sourceType: string;
      notes: string | null;
      createdAt: string;
    }>;
    openings: Array<{ accountType: string; opening: string }>;
  }> {
    const conds = [
      eq(schema.ledgerEntries.organizationId, organizationId),
      eq(schema.ledgerEntries.stationId, stationId),
    ];
    if (from) conds.push(gte(schema.ledgerEntries.entryDate, from));
    if (to) conds.push(lte(schema.ledgerEntries.entryDate, to));

    // Per-account-type opening balance = Σ(in − out) for entries strictly before
    // the range start. One grouped aggregate; index-supported by
    // ledger_entries_org_station_date_idx (org, station, entry_date).
    let openings: Array<{ accountType: string; opening: string }> = [];
    if (from) {
      const openRows = await this.db
        .select({
          accountType: schema.financialAccounts.accountType,
          opening: sql<string>`COALESCE(SUM(CASE WHEN ${schema.ledgerEntries.direction} = 'in' THEN ${schema.ledgerEntries.amount} ELSE -${schema.ledgerEntries.amount} END), 0)`,
        })
        .from(schema.ledgerEntries)
        .innerJoin(
          schema.financialAccounts,
          eq(schema.financialAccounts.id, schema.ledgerEntries.accountId),
        )
        .where(
          and(
            eq(schema.ledgerEntries.organizationId, organizationId),
            eq(schema.ledgerEntries.stationId, stationId),
            sql`${schema.ledgerEntries.entryDate} < ${from}`,
          ),
        )
        .groupBy(schema.financialAccounts.accountType);
      openings = openRows.map((r) => ({
        accountType: r.accountType,
        opening: String(r.opening ?? '0'),
      }));
    }

    const rows = await this.db
      .select({
        id: schema.ledgerEntries.id,
        entryDate: schema.ledgerEntries.entryDate,
        accountId: schema.ledgerEntries.accountId,
        accountType: schema.financialAccounts.accountType,
        accountName: schema.financialAccounts.name,
        direction: schema.ledgerEntries.direction,
        amount: schema.ledgerEntries.amount,
        sourceType: schema.ledgerEntries.sourceType,
        notes: schema.ledgerEntries.notes,
        createdAt: schema.ledgerEntries.createdAt,
      })
      .from(schema.ledgerEntries)
      .innerJoin(
        schema.financialAccounts,
        eq(schema.financialAccounts.id, schema.ledgerEntries.accountId),
      )
      .where(and(...conds))
      .orderBy(schema.ledgerEntries.entryDate, schema.ledgerEntries.createdAt);
    return {
      movements: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      openings,
    };
  }
}

/** Payment Terminal lookup for Office Records (#276). */
export class DrizzlePaymentTerminalLookup implements PaymentTerminalLookup {
  constructor(private readonly db: DbClient) {}
  async findById(id: string): Promise<OfficePaymentTerminal | null> {
    const [t] = await this.db
      .select({
        id: schema.paymentTerminals.id,
        organizationId: schema.paymentTerminals.organizationId,
        stationId: schema.paymentTerminals.stationId,
        isActive: schema.paymentTerminals.isActive,
        supportsCard: schema.paymentTerminals.supportsCard,
        supportsUpi: schema.paymentTerminals.supportsUpi,
        clearingAccountId: schema.paymentTerminals.clearingAccountId,
      })
      .from(schema.paymentTerminals)
      .where(eq(schema.paymentTerminals.id, id))
      .limit(1);
    return t ?? null;
  }
  defaultClearingAccountId(organizationId: string, stationId: string): Promise<string> {
    return new AccountProvisioningService(this.db).ensureClearingForProvider(
      organizationId,
      stationId,
      null,
    );
  }
}
