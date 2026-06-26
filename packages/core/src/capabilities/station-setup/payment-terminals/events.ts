import { BusinessEvents } from '../../../kernel/index.js';
import type { DomainEvent } from '../../../kernel/index.js';

export interface PaymentTerminalRegisteredPayload {
  paymentTerminalId: string;
  stationId: string;
  label: string;
}

export type PaymentTerminalRegistered = DomainEvent<
  typeof BusinessEvents.PAYMENT_TERMINAL_REGISTERED,
  PaymentTerminalRegisteredPayload
>;

export interface PaymentTerminalUpdatedPayload {
  paymentTerminalId: string;
  changes: Record<string, unknown>;
}

export type PaymentTerminalUpdated = DomainEvent<
  typeof BusinessEvents.PAYMENT_TERMINAL_UPDATED,
  PaymentTerminalUpdatedPayload
>;
