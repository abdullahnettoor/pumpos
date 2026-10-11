/**
 * Decantation flags and warnings (ADR 0007). Pure: used by the RecordDecantation
 * use-case and, live, by the Decantation drawer. Flags and warnings never block a
 * save — they only mark the record for review.
 */
export type DecantationFlagCode =
  'DENSITY_OUT_OF_TOLERANCE' | 'TANKER_SHORT' | 'CHAMBER_NOT_EMPTIED' | 'EARLY_AFTER_DIP';

export interface DecantationFlag {
  code: DecantationFlagCode;
  /** Set for per-line flags (density, early after dip). */
  tankLineId?: string;
  /** Set for per-chamber flags. */
  chamberNo?: number;
  message: string;
}

export type DecantationWarningCode = 'CHAMBER_EXCESS' | 'CHAMBER_CAPACITY_MISMATCH';

export interface DecantationWarning {
  code: DecantationWarningCode;
  chamberNo?: number;
  message: string;
}

export interface DecantationFlagLine {
  id: string;
  /** RO Density at 15 °C (kg/m³). */
  roDensity?: number | null;
  /**
   * Invoice density at 15 °C of the linked Fuel Purchase line for this product
   * (purchase_items.invoice_density, linked in #469). Unknown → no density flag.
   */
  invoiceDensity?: number | null;
  afterDipAt?: string | Date | null;
}

export interface DecantationFlagChamber {
  chamberNo: number;
  capacityL?: number | null;
  sealOk?: boolean | null;
  mark?: 'OK' | 'SHORT' | 'EXCESS' | null;
  emptied?: boolean | null;
}

export interface DecantationFlagInput {
  lines: DecantationFlagLine[];
  chambers?: DecantationFlagChamber[];
  chambersChecked?: boolean;
  unloadEndedAt?: string | Date | null;
  /** Total invoice quantity (litres) when known; drives the capacity warning only. */
  invoiceQuantity?: number | null;
  densityToleranceKgM3: number;
  settlingTimeMinutes: number;
}

export interface DecantationFlagResult {
  flags: DecantationFlag[];
  warnings: DecantationWarning[];
}

const toMs = (v: string | Date | null | undefined): number | null => {
  if (v == null) return null;
  const ms = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isNaN(ms) ? null : ms;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeDecantationFlags(input: DecantationFlagInput): DecantationFlagResult {
  const flags: DecantationFlag[] = [];
  const warnings: DecantationWarning[] = [];
  const endMs = toMs(input.unloadEndedAt);

  for (const line of input.lines) {
    if (line.roDensity != null && line.invoiceDensity != null) {
      const diff = round2(line.roDensity - line.invoiceDensity);
      if (Math.abs(diff) > input.densityToleranceKgM3) {
        flags.push({
          code: 'DENSITY_OUT_OF_TOLERANCE',
          tankLineId: line.id,
          message: `RO density differs from invoice density by ${diff} kg/m³ (tolerance ±${input.densityToleranceKgM3})`,
        });
      }
    }
    const afterMs = toMs(line.afterDipAt);
    if (endMs != null && afterMs != null) {
      const minutes = (afterMs - endMs) / 60000;
      if (minutes < input.settlingTimeMinutes) {
        flags.push({
          code: 'EARLY_AFTER_DIP',
          tankLineId: line.id,
          message: `After dip taken ${Math.max(0, Math.round(minutes))} min after unloading (settling time ${input.settlingTimeMinutes} min)`,
        });
      }
    }
  }

  const chambers = input.chambersChecked === false ? [] : (input.chambers ?? []);
  const short = chambers.filter((c) => c.mark === 'SHORT' || c.sealOk === false);
  if (short.length > 0) {
    flags.push({
      code: 'TANKER_SHORT',
      chamberNo: short[0].chamberNo,
      message: `Tanker short: ${short.map((c) => (c.sealOk === false ? `chamber ${c.chamberNo} seal broken` : `chamber ${c.chamberNo} short`)).join(', ')}`,
    });
  }
  if (endMs != null) {
    for (const c of chambers.filter((x) => x.emptied === false)) {
      flags.push({
        code: 'CHAMBER_NOT_EMPTIED',
        chamberNo: c.chamberNo,
        message: `Chamber ${c.chamberNo} not emptied`,
      });
    }
  }
  for (const c of chambers.filter((x) => x.mark === 'EXCESS')) {
    warnings.push({
      code: 'CHAMBER_EXCESS',
      chamberNo: c.chamberNo,
      message: `Chamber ${c.chamberNo} marked excess`,
    });
  }
  if (input.invoiceQuantity != null && chambers.some((c) => c.capacityL != null)) {
    const total = chambers.reduce((s, c) => s + (c.capacityL ?? 0), 0);
    if (Math.abs(total - input.invoiceQuantity) > 0.0005) {
      warnings.push({
        code: 'CHAMBER_CAPACITY_MISMATCH',
        message: `Chamber capacity ${total} L differs from invoice quantity ${input.invoiceQuantity} L`,
      });
    }
  }
  return { flags, warnings };
}

/** Stable identity of a flag, so an update only reports flags that newly appear. */
export const decantationFlagKey = (f: DecantationFlag): string =>
  `${f.code}:${f.tankLineId ?? ''}:${f.chamberNo ?? ''}`;
