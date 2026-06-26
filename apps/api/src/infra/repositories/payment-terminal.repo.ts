import { and, eq } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { PaymentTerminal, PaymentTerminalRepository } from '@pump/core';

type Row = typeof schema.paymentTerminals.$inferSelect;

function toEntity(row: Row): PaymentTerminal {
  return {
    id: row.id,
    organizationId: row.organizationId,
    stationId: row.stationId,
    label: row.label,
    provider: row.provider,
    terminalCode: row.terminalCode,
    supportsCard: row.supportsCard,
    supportsUpi: row.supportsUpi,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzlePaymentTerminalRepository implements PaymentTerminalRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string): Promise<PaymentTerminal | null> {
    const [row] = await this.db
      .select()
      .from(schema.paymentTerminals)
      .where(eq(schema.paymentTerminals.id, id))
      .limit(1);
    return row ? toEntity(row) : null;
  }

  async save(t: PaymentTerminal): Promise<void> {
    await this.db
      .insert(schema.paymentTerminals)
      .values({
        id: t.id,
        organizationId: t.organizationId,
        stationId: t.stationId,
        label: t.label,
        provider: t.provider,
        terminalCode: t.terminalCode,
        supportsCard: t.supportsCard,
        supportsUpi: t.supportsUpi,
        isActive: t.isActive,
        createdAt: new Date(t.createdAt),
        updatedAt: new Date(t.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.paymentTerminals.id,
        set: {
          label: t.label,
          provider: t.provider,
          terminalCode: t.terminalCode,
          supportsCard: t.supportsCard,
          supportsUpi: t.supportsUpi,
          isActive: t.isActive,
          updatedAt: new Date(t.updatedAt),
        },
      });
  }

  async existsByLabel(
    organizationId: string,
    stationId: string,
    label: string,
    excludeId?: string,
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.paymentTerminals.id })
      .from(schema.paymentTerminals)
      .where(
        and(
          eq(schema.paymentTerminals.organizationId, organizationId),
          eq(schema.paymentTerminals.stationId, stationId),
          eq(schema.paymentTerminals.label, label),
        ),
      );
    return rows.some((r) => r.id !== excludeId);
  }

  async listByStation(organizationId: string, stationId: string): Promise<PaymentTerminal[]> {
    const rows = await this.db
      .select()
      .from(schema.paymentTerminals)
      .where(
        and(
          eq(schema.paymentTerminals.organizationId, organizationId),
          eq(schema.paymentTerminals.stationId, stationId),
        ),
      );
    return rows.map(toEntity);
  }
}
