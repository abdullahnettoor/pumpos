import type { Repository } from '../../../kernel/index.js';

/** A payment terminal (card/UPI machine) — master data, like a dispenser unit. */
export interface PaymentTerminal {
  id: string;
  organizationId: string;
  stationId: string;
  label: string;
  provider: string | null;
  terminalCode: string | null;
  supportsCard: boolean;
  supportsUpi: boolean;
  /** The MERCHANT_CLEARING account this terminal settles into (Phase F). */
  clearingAccountId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTerminalRepository extends Repository<PaymentTerminal> {
  existsByLabel(
    organizationId: string,
    stationId: string,
    label: string,
    excludeId?: string,
  ): Promise<boolean>;
  listByStation(organizationId: string, stationId: string): Promise<PaymentTerminal[]>;
}
