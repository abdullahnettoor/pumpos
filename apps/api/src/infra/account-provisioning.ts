import { and, eq, sql } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import { DEFAULT_ACCOUNT_NAME, type FinancialAccountType } from '@pump/core';
import { normalizeProvider } from '@pump/shared';

/**
 * Provisions a station's default money accounts (Phase F consolidation). Every
 * station always needs Cash in Hand, a Bank, and a Card/UPI Clearing bucket, so
 * they're created at onboarding (and lazily ensured when a terminal is added).
 * Card/UPI clearing is per acquirer/provider: many terminals of the same
 * provider share one clearing account; provider-less terminals fall back to the
 * default "Card/UPI Clearing".
 */
export class AccountProvisioningService {
  constructor(private readonly db: DbClient) {}

  private async findByType(organizationId: string, stationId: string, type: FinancialAccountType): Promise<string | null> {
    const rows = await this.db
      .select({ id: schema.financialAccounts.id })
      .from(schema.financialAccounts)
      .where(and(eq(schema.financialAccounts.organizationId, organizationId), eq(schema.financialAccounts.stationId, stationId), eq(schema.financialAccounts.accountType, type)))
      .orderBy(schema.financialAccounts.createdAt)
      .limit(1);
    return rows[0]?.id ?? null;
  }

  private async createAccount(organizationId: string, stationId: string, type: FinancialAccountType, name: string, metadata?: Record<string, unknown> | null): Promise<string> {
    const [created] = await this.db
      .insert(schema.financialAccounts)
      .values({ organizationId, stationId, accountType: type, name, openingBalance: '0', openingDate: null, metadata: metadata ?? null, isActive: true })
      .returning({ id: schema.financialAccounts.id });
    return created.id;
  }

  /** Ensure Cash in Hand + a default Bank exist. Card/UPI clearing is NOT created
   *  here — it only exists per acquirer once a terminal is registered (you can't
   *  take card/UPI without a machine). */
  async ensureStationDefaults(organizationId: string, stationId: string): Promise<void> {
    for (const type of ['CASH_IN_HAND', 'BANK'] as FinancialAccountType[]) {
      const existing = await this.findByType(organizationId, stationId, type);
      if (!existing) await this.createAccount(organizationId, stationId, type, DEFAULT_ACCOUNT_NAME[type]);
    }
  }

  /**
   * Find (or create) the clearing account for an acquirer/provider. Matches an
   * existing MERCHANT_CLEARING by metadata.provider (case-insensitive); a blank
   * provider maps to the default "Card/UPI Clearing".
   */
  async ensureClearingForProvider(organizationId: string, stationId: string, provider?: string | null): Promise<string> {
    const prov = normalizeProvider(provider);
    const name = prov ? `${prov} Clearing` : DEFAULT_ACCOUNT_NAME.MERCHANT_CLEARING;

    if (prov) {
      const match = await this.db
        .select({ id: schema.financialAccounts.id })
        .from(schema.financialAccounts)
        .where(
          and(
            eq(schema.financialAccounts.organizationId, organizationId),
            eq(schema.financialAccounts.stationId, stationId),
            eq(schema.financialAccounts.accountType, 'MERCHANT_CLEARING'),
            sql`lower(${schema.financialAccounts.metadata}->>'provider') = lower(${prov})`,
          ),
        )
        .limit(1);
      if (match[0]) return match[0].id;
    } else {
      // Default (provider-less) clearing: reuse the one without a provider tag.
      const def = await this.db
        .select({ id: schema.financialAccounts.id })
        .from(schema.financialAccounts)
        .where(
          and(
            eq(schema.financialAccounts.organizationId, organizationId),
            eq(schema.financialAccounts.stationId, stationId),
            eq(schema.financialAccounts.accountType, 'MERCHANT_CLEARING'),
            sql`(${schema.financialAccounts.metadata} IS NULL OR ${schema.financialAccounts.metadata}->>'provider' IS NULL)`,
          ),
        )
        .orderBy(schema.financialAccounts.createdAt)
        .limit(1);
      if (def[0]) return def[0].id;
    }

    return this.createAccount(organizationId, stationId, 'MERCHANT_CLEARING', name, prov ? { provider: prov } : null);
  }

  async linkTerminal(terminalId: string, clearingAccountId: string): Promise<void> {
    await this.db.update(schema.paymentTerminals).set({ clearingAccountId }).where(eq(schema.paymentTerminals.id, terminalId));
  }

  /** Link every terminal at a station to a clearing account grouped by provider. */
  async provisionTerminalClearing(organizationId: string, stationId: string): Promise<void> {
    const terminals = await this.db
      .select({ id: schema.paymentTerminals.id, provider: schema.paymentTerminals.provider, clearingAccountId: schema.paymentTerminals.clearingAccountId })
      .from(schema.paymentTerminals)
      .where(and(eq(schema.paymentTerminals.stationId, stationId), eq(schema.paymentTerminals.organizationId, organizationId)));
    const byProvider = new Map<string, string>();
    for (const t of terminals) {
      if (t.clearingAccountId) continue;
      const key = (normalizeProvider(t.provider) ?? '').toLowerCase();
      let clearingId = byProvider.get(key);
      if (!clearingId) {
        clearingId = await this.ensureClearingForProvider(organizationId, stationId, t.provider);
        byProvider.set(key, clearingId);
      }
      await this.linkTerminal(t.id, clearingId);
    }
  }
}
