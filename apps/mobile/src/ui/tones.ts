import type { StatusTone } from '@pump/shared';

/**
 * The one tone vocabulary for figures and fills: which Tailwind class a tone
 * paints. Status text uses the `-fg` tokens (readable on cards and tinted
 * surfaces in both themes); fills use the solid status colours.
 */
export type Tone = 'default' | 'good' | 'warn' | 'bad';

/** Text colour of a figure by tone (also for an inline figure outside a tile). `muted` is for a quiet caption. */
export const TONE_TEXT: Record<Tone | 'muted', string> = {
  default: 'text-text-high',
  muted: 'text-text-muted',
  good: 'text-good',
  warn: 'text-warn-fg',
  bad: 'text-bad-fg',
};

/** Solid fill of a bar or dot by tone (`accent`: the brand colour, for an in-limit bar). */
export const TONE_FILL: Record<'accent' | 'good' | 'warn' | 'bad', string> = {
  accent: 'bg-accent',
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
};

/** The pill tones (`StatusBadge`). */
export type BadgeTone = 'good' | 'warn' | 'bad' | 'info' | 'muted';

const BADGE_TONE: Record<StatusTone, BadgeTone> = {
  success: 'good',
  warning: 'warn',
  danger: 'bad',
  info: 'info',
  neutral: 'muted',
};

/** A shared-vocabulary tone (#518, `statusPresentation`) in the mobile tone names. */
export const badgeTone = (tone: StatusTone): BadgeTone => BADGE_TONE[tone];
