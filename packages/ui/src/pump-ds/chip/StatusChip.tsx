import React, { forwardRef } from 'react';
import { Chip, type ChipProps, type ChipSize, type ChipVariant } from './Chip.js';
import { STATUS_MAP, type PumpStatus } from './status-map.js';

/**
 * StatusChip — the domain-typed wrapper over `Chip` that carries the
 * canonical PumpOS status vocabulary. Prefer this over hand-configured
 * `<Chip>` for anything representing an operational state: shifts, sync,
 * receivables, variance.
 *
 * Rendering options carry through: pass `size`, `variant`, or `className`
 * to tweak the look; pass `label` to override the canonical label when the
 * surface needs a specific phrasing (e.g. "Overdue 12d" instead of just
 * "Overdue"); toggle `showIcon` to hide the leading icon when density
 * requires text-only.
 */
export interface StatusChipProps extends Omit<ChipProps, 'children' | 'tone' | 'icon' | 'dot' | 'pulse'> {
  status: PumpStatus;
  size?: ChipSize;
  variant?: ChipVariant;
  /** Override the canonical label (e.g. "Overdue 12d" instead of "Overdue"). */
  label?: string;
  /** Show the leading icon. Default: true. */
  showIcon?: boolean;
  /** Force a pulsing dot (default: derives from STATUS_MAP entry). */
  pulse?: boolean;
}

export const StatusChip = forwardRef<HTMLSpanElement, StatusChipProps>(function StatusChip(
  { status, label, showIcon = true, pulse, ...rest },
  ref
) {
  const meta = STATUS_MAP[status];
  const Icon = meta.icon;
  const effectivePulse = pulse ?? meta.pulse ?? false;

  return (
    <Chip
      ref={ref}
      tone={meta.tone}
      icon={showIcon ? <Icon /> : undefined}
      dot={!showIcon && effectivePulse}
      pulse={effectivePulse}
      {...rest}
    >
      {label ?? meta.label}
    </Chip>
  );
});
