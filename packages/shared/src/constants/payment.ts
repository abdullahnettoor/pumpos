/**
 * Common card/UPI acquirers & aggregators (Indian market) offered as a curated
 * dropdown when registering a payment terminal, plus an "Other…" custom option
 * in the UI. Kept as a plain string list (not a DB enum) so it stays extensible;
 * the chosen/typed value is stored on `payment_terminals.provider` and drives the
 * "Auto — group by provider" clearing-account grouping.
 */
export const PAYMENT_PROVIDERS: readonly string[] = [
  'HDFC Bank',
  'ICICI Bank',
  'SBI',
  'Axis Bank',
  'Kotak',
  'Yes Bank',
  'Pine Labs',
  'Paytm',
  'PhonePe',
  'BharatPe',
  'Razorpay',
  'Mswipe',
  'Ezetap',
  'Google Pay',
];

/** Normalise a provider label so free-text variants group consistently
 *  ("Paytm", "paytm ", "Pay  TM" → matched case-insensitively after trim +
 *  whitespace-collapse). Returns null for blank input. */
export function normalizeProvider(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  return cleaned.length ? cleaned : null;
}
