import type {
  DecantationReportInvoice,
  DecantationReportInvoiceLink,
  DecantationReportVisit,
} from '@pump/shared';
import type { PumpStatus } from '../../../pump-ds/index.js';
import { formatQuantity } from '../../../utils/format.js';

/**
 * How the Decantation report names its states, in the shared status
 * vocabulary (#518). The vocabulary has no decantation words yet, so each
 * state borrows the vocabulary entry with the same meaning and tone and keeps
 * its own word: measured is done (green), pending and settling wait (grey),
 * discarded is struck out. A settled invoice reads as its variance instead.
 */
export interface StateWord {
  status: PumpStatus;
  label: string;
}

const VISIT: Record<DecantationReportVisit['status'], StateWord> = {
  DRAFT: { status: 'handover-pending', label: 'Draft' },
  PENDING_MEASUREMENT: { status: 'awaiting-decantation', label: 'Pending measurement' },
  MEASURED: { status: 'handover-recorded', label: 'Measured' },
  DISCARDED: { status: 'voided', label: 'Discarded' },
};

export const visitState = (status: DecantationReportVisit['status']): StateWord => VISIT[status];

/**
 * A visit's invoice link before it settles; `null` once settled, when the
 * link reads as its variance (`VarianceChip`).
 */
export function linkState(
  link: Pick<DecantationReportInvoiceLink, 'status' | 'statusLabel'>,
): StateWord | null {
  switch (link.status) {
    case 'NOT_LINKED':
      return { status: 'inactive', label: link.statusLabel || 'Purchase not linked' };
    case 'PENDING_MEASUREMENT':
      return { status: 'awaiting-decantation', label: link.statusLabel || 'Pending measurement' };
    case 'SETTLING':
      return { status: 'handover-pending', label: 'Settling' };
    default:
      return null;
  }
}

/** An invoice of the report waiting on a sibling visit; `null` once settled. */
export const invoiceState = (
  invoice: Pick<DecantationReportInvoice, 'status'>,
): StateWord | null =>
  invoice.status === 'SETTLING' ? { status: 'handover-pending', label: 'Settling' } : null;

/** Litres in the one quantity format; a missing figure is `—`, never 0. */
export const litres = (v: number | null | undefined): string => formatQuantity(v, 'L');

/** A product as the report names it: `Motor Spirit (MS)`. */
export const productLabel = (p: { productName: string; productCode: string }): string =>
  p.productCode ? `${p.productName} (${p.productCode})` : p.productName;

/** A visit's transit findings: `1 short · 1 seal broken`, empty when there are none. */
export function transitText(v: Pick<DecantationReportVisit, 'summary'>): string {
  const s = v.summary;
  return [
    s.shortChambers > 0 ? `${s.shortChambers} short` : null,
    s.excessChambers > 0 ? `${s.excessChambers} excess` : null,
    s.sealsBroken > 0 ? `${s.sealsBroken} seal${s.sealsBroken > 1 ? 's' : ''} broken` : null,
    s.notEmptiedChambers > 0 ? `${s.notEmptiedChambers} unemptied` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A density deviation (kg/m³) past this many units is a problem worth showing. */
export const DENSITY_TOLERANCE = 3;
