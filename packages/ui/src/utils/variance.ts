import {
  variancePresentation,
  type StatusTone,
  type VarianceKind,
  type VariancePresentation,
} from '@pump/shared';
import { formatQuantity, signedMoneyParts } from './format.js';

export interface VarianceDisplay extends VariancePresentation {
  /** What the screen shows: `Balanced`, `+₹1,200.00`, `−₹340.50`, `+12.50 L`. */
  text: string;
}

/**
 * A variance as read everywhere (#518): the state, word and tone come from the
 * shared vocabulary (`variancePresentation`, balanced by `isBalancedVariance`);
 * the figure from the one signed-money / quantity format (#519). Cash in
 * rupees, stock in litres. `decimals: 0` gives whole rupees, except under ₹1
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
      ? formatQuantity(n, 'L', { plus: true })
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
