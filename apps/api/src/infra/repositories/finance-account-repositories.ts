import { and, asc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
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
    const rows = await this.db.select().from(schema.financialAccounts).where(eq(schema.financialAccounts.id, id)).limit(1);
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async existsByName(organizationId: string, stationId: string | null, name: string, excludeId?: string): Promise<boolean> {
    const conds = [
      eq(schema.financialAccounts.organizationId, organizationId),
      stationId ? eq(schema.financialAccounts.stationId, stationId) : isNull(schema.financialAccounts.stationId),
      sql`lower(${schema.financialAccounts.name}) = lower(${name})`,
      ...(excludeId ? [ne(schema.financialAccounts.id, excludeId)] : []),
    ];
    const rows = await this.db.select({ id: schema.financialAccounts.id }).from(schema.financialAccounts).where(and(...conds)).limit(1);
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

  async deleteByAccountAndSource(accountId: string, sourceType: LedgerEntry['sourceType']): Promise<void> {
    await this.db
      .delete(schema.ledgerEntries)
      .where(and(eq(schema.ledgerEntries.accountId, accountId), eq(schema.ledgerEntries.sourceType, sourceType)));
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

  async listWithBalances(organizationId: string, stationId?: string | null): Promise<AccountWithBalance[]> {
    const conds = [eq(schema.financialAccounts.organizationId, organizationId)];
    if (stationId) conds.push(eq(schema.financialAccounts.stationId, stationId));
    const rows = await this.db
      .select({
        account: schema.financialAccounts,
        balance: sql<string>`COALESCE(SUM(CASE WHEN ${schema.ledgerEntries.direction} = 'in' THEN ${schema.ledgerEntries.amount} ELSE -${schema.ledgerEntries.amount} END), 0)`,
      })
      .from(schema.financialAccounts)
      .leftJoin(schema.ledgerEntries, eq(schema.ledgerEntries.accountId, schema.financialAccounts.id))
      .where(and(...conds))
      .groupBy(schema.financialAccounts.id)
      .orderBy(asc(schema.financialAccounts.accountType), asc(schema.financialAccounts.name));
    return rows.map((r) => ({ ...toAccount(r.account), balance: String(r.balance) }));
  }

  /** Account statement: period-opening balance (Σ before `from`) + entries in [from,to]. */
  async accountLedger(
    organizationId: string,
    accountId: string,
    from?: string,
    to?: string,
  ): Promise<{ account: FinancialAccount; periodOpeningBalance: string; entries: LedgerEntry[] } | null> {
    const accRows = await this.db
      .select()
      .from(schema.financialAccounts)
      .where(and(eq(schema.financialAccounts.id, accountId), eq(schema.financialAccounts.organizationId, organizationId)))
      .limit(1);
    if (!accRows[0]) return null;

    let periodOpeningBalance = '0';
    if (from) {
      const [openRow] = await this.db
        .select({
          bal: sql<string>`COALESCE(SUM(CASE WHEN ${schema.ledgerEntries.direction} = 'in' THEN ${schema.ledgerEntries.amount} ELSE -${schema.ledgerEntries.amount} END), 0)`,
        })
        .from(schema.ledgerEntries)
        .where(and(eq(schema.ledgerEntries.accountId, accountId), sql`${schema.ledgerEntries.entryDate} < ${from}`));
      periodOpeningBalance = String(openRow?.bal ?? '0');
    }

    const rangeConds = [eq(schema.ledgerEntries.accountId, accountId)];
    if (from) rangeConds.push(gte(schema.ledgerEntries.entryDate, from));
    if (to) rangeConds.push(lte(schema.ledgerEntries.entryDate, to));
    const entryRows = await this.db
      .select()
      .from(schema.ledgerEntries)
      .where(and(...rangeConds))
      .orderBy(asc(schema.ledgerEntries.entryDate), asc(schema.ledgerEntries.createdAt));

    return { account: toAccount(accRows[0]), periodOpeningBalance, entries: entryRows.map(toEntry) };
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
    movements: Array<{ id: string; entryDate: string; accountId: string; accountType: string; accountName: string; direction: string; amount: string; sourceType: string; notes: string | null; createdAt: string }>;
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
        .innerJoin(schema.financialAccounts, eq(schema.financialAccounts.id, schema.ledgerEntries.accountId))
        .where(and(
          eq(schema.ledgerEntries.organizationId, organizationId),
          eq(schema.ledgerEntries.stationId, stationId),
          sql`${schema.ledgerEntries.entryDate} < ${from}`,
        ))
        .groupBy(schema.financialAccounts.accountType);
      openings = openRows.map((r) => ({ accountType: r.accountType, opening: String(r.opening ?? '0') }));
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
      .innerJoin(schema.financialAccounts, eq(schema.financialAccounts.id, schema.ledgerEntries.accountId))
      .where(and(...conds))
      .orderBy(schema.ledgerEntries.entryDate, schema.ledgerEntries.createdAt);
    return { movements: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), openings };
  }
}
