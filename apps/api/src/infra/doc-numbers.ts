import type { DocumentNumberGenerator } from '@pump/core';

const PREFIXES: Record<string, string> = {
  SALE: 'SAL',
  COLLECTION: 'COLL',
  PURCHASE: 'PUR',
  EXPENSE: 'EXP',
  PAYMENT: 'PAY',
};

/**
 * Generates human-readable, collision-resistant document numbers.
 * Format: PREFIX-<base36 timestamp>-<random>. Good enough for per-document
 * identity; a strictly monotonic sequence can replace this later.
 */
export class TimestampDocumentNumberGenerator implements DocumentNumberGenerator {
  async next(documentType: string): Promise<string> {
    const prefix = PREFIXES[documentType] ?? documentType.slice(0, 4).toUpperCase();
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(Math.random() * 1296)
      .toString(36)
      .toUpperCase()
      .padStart(2, '0');
    return `${prefix}-${ts}${rand}`;
  }
}
