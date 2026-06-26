/** Commands (intents) for the payment-terminal use-cases. */
export interface RegisterPaymentTerminalCommand {
  stationId: string;
  label: string;
  provider?: string | null;
  terminalCode?: string | null;
  supportsCard?: boolean;
  supportsUpi?: boolean;
}

export interface UpdatePaymentTerminalCommand {
  id: string;
  label?: string;
  provider?: string | null;
  terminalCode?: string | null;
  supportsCard?: boolean;
  supportsUpi?: boolean;
  isActive?: boolean;
}
