import {
  isBalancedQuantity,
  variancePresentation,
  type StatusTone,
  type VarianceKind,
  type VariancePresentation,
} from '@pump/shared';
import { formatQuantity, quantityDecimals, signedMoneyParts } from './format.js';

export interface VarianceDisplay extends VariancePresentation {
  /** What the screen shows: `Balanced`, `+₹1,200.00`, `−₹340.50`, `+12.50 L`. */
  text: string;
}

/**
 * A variance as read everywhere (#518): the state, word and tone come from the
 * shared vocabulary (`variancePresentation`: cash balanced by
 * `isBalancedVariance`, stock by `isBalancedQuantity`); the figure from the one
 * signed-money / quantity format (#519). Cash in rupees, stock in litres. `decimals: 0` gives whole rupees, except under ₹1
 * where rounding would show a real variance as ₹0. `symbol: false` drops the ₹.
 */
export function formatVariance(
  amount: number | string | null | undefined,
  kind: VarianceKind,
  opts: {
    decimals?: number;
    /** `false` drops the ₹ (a table whose caption states the currency). Cash only. */
    symbol?: boolean;
  } = {},
): VarianceDisplay {
  const p = variancePresentation(amount, kind);
  if (p.state === 'balanced') return { ...p, text: p.label };
  const n = Number(amount);
  const text =
    kind === 'stock'
      ? formatStockVariance(n, 'L')
      : signedMoneyParts(n, {
          plus: true,
          decimals: Math.abs(n) < 1 ? 2 : (opts.decimals ?? 2),
          symbol: opts.symbol,
        }).text;
  return { ...p, text };
}

/** The CSS text colour of a tone, for inline-styled (legacy) surfaces. */
export const VARIANCE_TONE_TEXT: Record<StatusTone, string> = {
  success: 'var(--state-success-fg)',
  warning: 'var(--state-warning-fg)',
  danger: 'var(--state-danger-fg)',
  info: 'var(--state-info-fg)',
  neutral: 'var(--text-muted)',
};

/**
 * A stock variance's signed figure in its unit (`+12.50 L`, `−2 Nos`): the
 * unit's own decimals, except that a variance the balanced rule counts
 * (`isBalancedQuantity`, #556) but those decimals would round to zero reads to
 * 3 places, the step quantities are recorded in (`+0.004 L`), so a Short or
 * Surplus never shows as `0.00 L`.
 */
export function formatStockVariance(
  amount: number | string | null | undefined,
  unit: string | null | undefined,
  /** `plus: false` prints a magnitude after its word ("Short 0.004 L"). */
  opts: { plus?: boolean } = {},
): string {
  const n = Number(amount);
  const decimals = quantityDecimals(unit);
  const hidden =
    Number.isFinite(n) && !isBalancedQuantity(n) && Math.round(Math.abs(n) * 10 ** decimals) === 0;
  return formatQuantity(amount, unit, {
    plus: opts.plus ?? true,
    decimals: hidden ? 3 : undefined,
  });
}
