import { compareNatural, reconcileDrawer } from '@pump/shared';

// ── Nozzle readings ─────────────────────────────────────────────────────────

/** A nozzle as the Handover drawer receives it (the shift's reading row). */
export interface HandoverNozzleInput {
  nozzleId: string;
  nozzleName?: string | null;
  productId?: string | null;
  productName?: string | null;
  productCode?: string | null;
  unit?: string | null;
  openingReading?: number | string | null;
  unitPrice?: number | string | null;
}

export interface HandoverNozzleRow {
  nozzleId: string;
  nozzle: string;
  product: string;
  productId: string | null;
  unit: string;
  rate: number;
  opening: number;
  closing: number;
  /** Closing below opening: blocks the save. */
  invalid: boolean;
  /** Metered litres (never negative). */
  volume: number;
  testing: number;
  /** (volume − testing) × rate, rupees. */
  value: number;
}

export interface HandoverNozzles {
  rows: HandoverNozzleRow[];
  volume: number;
  testing: number;
  /** Σ metered value less testing, never below zero: the Fuel sales line. */
  fuelSales: number;
  /** One unit when every nozzle shares it, else 'units'. */
  unit: string;
  /** Litres metered and not testing, per fuel product (credit lines may not exceed it). */
  meteredByProduct: Map<string, number>;
}

const num = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/**
 * The Handover's nozzle figures, as the drawer computed them before the
 * redesign: volume = closing − opening (never below zero), testing deducted
 * at the pump price, nozzles in natural order (N1, N2 … N10).
 */
export function handoverNozzles(
  nozzles: HandoverNozzleInput[],
  closing: Record<string, unknown>,
  testing: Record<string, unknown>,
): HandoverNozzles {
  const rows = [...nozzles]
    .sort((a, b) => compareNatural(a.nozzleName ?? '', b.nozzleName ?? ''))
    .map((nz) => {
      const opening = num(nz.openingReading);
      const close = num(closing[nz.nozzleId] ?? opening);
      const volume = Math.max(0, close - opening);
      const rate = num(nz.unitPrice);
      const test = num(testing[nz.nozzleId]);
      return {
        nozzleId: nz.nozzleId,
        nozzle: nz.nozzleName || 'Nozzle',
        product: nz.productName || nz.productCode || 'Fuel',
        productId: nz.productId ?? null,
        unit: nz.unit || 'L',
        rate,
        opening,
        closing: close,
        invalid: close < opening,
        volume,
        testing: test,
        value: (volume - test) * rate,
      };
    });
  const raw = rows.reduce((s, r) => s + r.volume * r.rate, 0);
  const deduction = rows.reduce((s, r) => s + r.testing * r.rate, 0);
  const units = new Set(rows.map((r) => r.unit));
  const meteredByProduct = new Map<string, number>();
  for (const r of rows) {
    if (!r.productId) continue;
    meteredByProduct.set(
      r.productId,
      (meteredByProduct.get(r.productId) ?? 0) + Math.max(0, r.volume - r.testing),
    );
  }
  return {
    rows,
    volume: rows.reduce((s, r) => s + r.volume, 0),
    testing: rows.reduce((s, r) => s + r.testing, 0),
    fuelSales: Math.max(0, raw - deduction),
    unit: units.size === 1 ? [...units][0] : 'units',
    meteredByProduct,
  };
}

// ── The reconciliation ──────────────────────────────────────────────────────

/**
 * Σ of amounts as entered, unrounded: what the payload sends and the server
 * sums. Rounding happens once, on what `reconcileDrawer` returns (#534 review
 * round 2); a figure shown alone is rounded by its money format.
 */
export const sumAmounts = (lines: { amount?: number | string | null }[]): number =>
  lines.reduce((s, l) => {
    const n = Number(l.amount ?? 0);
    return Number.isFinite(n) ? s + n : s;
  }, 0);

/** The drawer's form, as the reconciliation reads it. */
export interface HandoverReconFormInput {
  /** The DU's own terminals (only these carry its card / UPI). */
  terminals: { terminalId: string }[];
  /** No station terminal configured: one card and one UPI total are typed. */
  aggregateAllowed: boolean;
  values: {
    cashHandedOver?: unknown;
    cashDrops?: unknown;
    cardHandedOver?: unknown;
    upiHandedOver?: unknown;
    terminalCard?: Record<string, unknown>;
    terminalUpi?: Record<string, unknown>;
  };
  creditLines: { amount?: number | string | null }[];
  omcLines: { amount?: number | string | null }[];
  fuelSales: number;
  productCash: number;
  openingFloat: number;
}

const amount = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The drawer's form mapped to the reconciliation's inputs, the way the save
 * payload carries them: card / UPI from the DU's terminal batches (or the
 * typed totals when the station has no terminal), credit and OMC card from the
 * recorded lines. Every amount raw, so the preview is the server's figure.
 */
export function handoverReconInput(f: HandoverReconFormInput): HandoverReconInput & {
  terminalCard: number;
  terminalUpi: number;
} {
  const terminalCard = sumAmounts(
    f.terminals.map((t) => ({ amount: amount(f.values.terminalCard?.[t.terminalId]) })),
  );
  const terminalUpi = sumAmounts(
    f.terminals.map((t) => ({ amount: amount(f.values.terminalUpi?.[t.terminalId]) })),
  );
  const has = f.terminals.length > 0;
  return {
    fuelSales: f.fuelSales,
    productCash: f.productCash,
    card: has ? terminalCard : f.aggregateAllowed ? amount(f.values.cardHandedOver) : 0,
    upi: has ? terminalUpi : f.aggregateAllowed ? amount(f.values.upiHandedOver) : 0,
    credit: sumAmounts(f.creditLines),
    omc: sumAmounts(f.omcLines),
    openingFloat: f.openingFloat,
    drops: amount(f.values.cashDrops),
    declaredCash: amount(f.values.cashHandedOver),
    terminalCard,
    terminalUpi,
  };
}

/**
 * The Handover drawer's reconciliation (#534), the lines the operator reads
 * top to bottom:
 *
 *   Fuel sales + Product sales (cash) − Card · UPI − Credit · OMC card = Cash sales
 *   Opening float + Cash sales − Cash drops                         = Expected in drawer
 *   Declared cash − Expected in drawer                              = Variance
 *
 * The figures that matter (cash sales, expected in drawer, variance) come from
 * `reconcileDrawer` in `@pump/shared`: the one formula the server's
 * `record-handover` and the mobile preview use, so the preview never differs
 * from the recorded figure by a paisa. The other lines are its inputs, shown
 * to the paisa. Once the server accepts the Handover its own figures replace
 * the preview.
 */
export interface HandoverRecon {
  source: 'preview' | 'accepted';
  /** Metered fuel value, net of testing. */
  fuelSales: number;
  /** Product sales paid in cash this attendant collected. */
  productCash: number;
  cardUpi: number;
  /** Fuel on credit plus OMC fleet-card sales: not drawer cash. */
  creditOmc: number;
  cashSales: number;
  openingFloat: number;
  drops: number;
  expected: number;
  declaredCash: number;
  /** Cash + card + UPI + credit + OMC: everything the attendant declared. */
  declaredTotal: number;
  variance: number;
}

export interface HandoverReconInput {
  fuelSales: number;
  productCash: number;
  card: number;
  upi: number;
  credit: number;
  omc: number;
  openingFloat: number;
  drops: number;
  declaredCash: number;
}

/** A figure shown to the paisa; `|| 0` normalises -0. */
const paise = (v: number) => Math.round(v * 100) / 100 || 0;

export function handoverRecon(i: HandoverReconInput): HandoverRecon {
  const d = reconcileDrawer({
    openingFloat: i.openingFloat,
    expectedFuelSales: i.fuelSales,
    merchandiseCash: i.productCash,
    cardHandedOver: i.card,
    upiHandedOver: i.upi,
    creditSales: i.credit,
    omcCardSales: i.omc,
    cashHandedOver: i.declaredCash,
    cashDrops: i.drops,
  });
  return {
    source: 'preview',
    // Inputs as entered: their money format rounds them for display.
    fuelSales: i.fuelSales,
    productCash: i.productCash,
    cardUpi: i.card + i.upi,
    creditOmc: i.credit + i.omc,
    openingFloat: i.openingFloat,
    drops: i.drops,
    declaredCash: i.declaredCash,
    // The reconciliation's own figures, rounded once, by `reconcileDrawer`.
    cashSales: d.cashSales,
    expected: d.expectedCash,
    declaredTotal: paise(d.declaredTotal),
    variance: d.varianceAmount,
  };
}

/** The slice of the server's accepted Handover the reconciliation reads. */
export interface AcceptedHandover {
  handover: {
    cashHandedOver: string | number;
    cardHandedOver: string | number;
    upiHandedOver: string | number;
  };
  expectedFuelSales: number;
  merchandiseCash: number;
  creditSales: number;
  omcCardSales: number;
  openingFloat: number;
  cashDrops: number;
  expectedCash: number;
  declaredTotal: number;
  varianceAmount: number;
}

/** The server's figures, laid out as the same lines (cash sales is what makes them add up). */
export function acceptedHandoverRecon(a: AcceptedHandover): HandoverRecon {
  const n = (v: string | number) => Number(v) || 0;
  return {
    source: 'accepted',
    fuelSales: paise(a.expectedFuelSales),
    productCash: paise(a.merchandiseCash),
    cardUpi: paise(n(a.handover.cardHandedOver) + n(a.handover.upiHandedOver)),
    creditOmc: paise(a.creditSales + a.omcCardSales),
    cashSales: paise(a.expectedCash - a.openingFloat + a.cashDrops),
    openingFloat: paise(a.openingFloat),
    drops: paise(a.cashDrops),
    expected: paise(a.expectedCash),
    declaredCash: paise(n(a.handover.cashHandedOver)),
    declaredTotal: paise(a.declaredTotal),
    variance: paise(a.varianceAmount),
  };
}
