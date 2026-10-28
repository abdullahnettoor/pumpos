import React, { forwardRef } from 'react';
import type { VarianceKind } from '@pump/shared';
import { formatVariance } from '../../utils/variance.js';
import { cn } from '../lib/cn.js';
import { Chip, type ChipProps } from './Chip.js';

/**
 * VarianceChip — a variance (counted − expected) as a chip (#518): "Balanced"
 * in green, a surplus `+₹1,200.00` in amber, a shortage `−₹340.00` in red.
 * Words, tones and the balanced rule come from the shared vocabulary; the
 * figure from the one money / quantity format. `kind="stock"` reads litres.
 */
export interface VarianceChipProps extends Omit<ChipProps, 'children' | 'tone' | 'icon' | 'dot'> {
  amount: number | string | null | undefined;
  /** Rupees (default) or litres. */
  kind?: VarianceKind;
  /** Decimal places for a cash figure (2 by default; 0 for whole rupees). */
  decimals?: number;
}

export const VarianceChip = forwardRef<HTMLSpanElement, VarianceChipProps>(function VarianceChip(
  { amount, kind = 'cash', decimals, className, ...rest },
  ref,
) {
  const v = formatVariance(amount, kind, { decimals });
  return (
    <Chip
      ref={ref}
      tone={v.tone}
      data-variance={v.state}
      title={v.state === 'balanced' ? undefined : v.label}
      className={cn(v.state !== 'balanced' && 'font-mono tabular-nums', className)}
      {...rest}
    >
      {v.text}
    </Chip>
  );
});
