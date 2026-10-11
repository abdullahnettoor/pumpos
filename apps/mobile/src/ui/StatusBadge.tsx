import React from 'react';
import { Chip, type ChipTone } from '@pump/ui';

export type BadgeTone = 'good' | 'warn' | 'bad' | 'info' | 'muted';

/** The mobile tone names, mapped onto the design system's `Chip` tones. */
const TONE: Record<BadgeTone, ChipTone> = {
  good: 'success',
  warn: 'warning',
  bad: 'danger',
  info: 'info',
  muted: 'neutral',
};

interface Props {
  tone?: BadgeTone;
  children: React.ReactNode;
  /** Put figures in the mono face (a variance amount). */
  num?: boolean;
}

/**
 * Small pill for a state: Closed, Draft, Balanced, +₹120. A `Chip` with free
 * text; for a canonical status (Open, Overdue, Paid) use the design system's
 * `StatusChip` directly.
 */
export const StatusBadge: React.FC<Props> = ({ tone = 'muted', children, num }) => (
  <Chip tone={TONE[tone]} className={`text-[10.5px] font-bold ${num ? 'num' : ''}`}>
    {children}
  </Chip>
);
