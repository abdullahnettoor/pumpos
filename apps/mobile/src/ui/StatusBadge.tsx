import React from 'react';

export type BadgeTone = 'good' | 'warn' | 'bad' | 'info' | 'muted';

const TONE: Record<BadgeTone, string> = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn-fg border border-warn-line',
  bad: 'bg-bad-soft text-bad-fg',
  info: 'bg-info-soft text-info',
  muted: 'bg-card-alt text-text-muted border border-line',
};

interface Props {
  tone?: BadgeTone;
  children: React.ReactNode;
  /** Put figures in the mono face (a variance amount). */
  num?: boolean;
}

/** Small pill for a state: Closed, Draft, Balanced, +₹120. */
export const StatusBadge: React.FC<Props> = ({ tone = 'muted', children, num }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-[10.5px] font-bold ${TONE[tone]} ${num ? 'num' : ''}`}
  >
    {children}
  </span>
);
