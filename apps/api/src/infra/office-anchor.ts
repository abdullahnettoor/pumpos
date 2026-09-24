import { and, eq, isNull } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { DEFAULT_ACCOUNT_NAME, type FinancialAccountType } from '@pump/core';

/**
 * TODO(#273): transitional bridge for the ADR 0005 schema groundwork (#280).
 *
 * Office tables (collections, expenses, other_income, supplier_transactions)
 * now carry explicit organization_id / station_id / entry_date /
 * funding_account_id instead of shift_id / business_day_id / paid_from.
 * The use-cases still think in the old anchor model, so adapters call this to
 * derive the new not-null columns from the business day the use-case resolved:
 *   - organizationId / stationId come from the business_days row,
 *   - entryDate uses the business date as a placeholder (the real
 *     station-timezone calendar entry date arrives with #273),
 *   - fundingAccountId maps the legacy paid_from / received_into enum to the
 *     station's system account (same lazy provisioning as LedgerPostingService).
 * The legacy anchor fields are stashed in each row's metadata so reads keep
 * their current behavior until #273 rewrites the office flows.
 */
export interface OfficeColumns {
  organizationId: string;
  stationId: string;
  entryDate: string;
  fundingAccountId: string;
}

async function ensureAccount(
  db: DbClient,
  organizationId: string,
  stationId: string,
  type: FinancialAccountType,
): Promise<string> {
  const existing = await db
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

  const shared = await db
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

  const [created] = await db
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

/** Resolve the new office-record columns from a legacy business-day anchor. */
export async function resolveOfficeColumns(
  db: DbClient,
  businessDayId: string,
  accountType: FinancialAccountType,
): Promise<OfficeColumns> {
  const [day] = await db
    .select({
      organizationId: schema.businessDays.organizationId,
      stationId: schema.businessDays.stationId,
      businessDate: schema.businessDays.businessDate,
    })
    .from(schema.businessDays)
    .where(eq(schema.businessDays.id, businessDayId))
    .limit(1);
  if (!day) throw new Error(`Business day ${businessDayId} not found`);
  const fundingAccountId = await ensureAccount(db, day.organizationId, day.stationId, accountType);
  return {
    organizationId: day.organizationId,
    stationId: day.stationId,
    // TODO(#273): placeholder — real entry date is a station-timezone calendar date.
    entryDate: day.businessDate,
    fundingAccountId,
  };
}
