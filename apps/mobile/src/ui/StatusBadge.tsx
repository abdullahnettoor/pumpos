import React from 'react';
import { statusPresentation, type PumpState } from '@pump/shared';
import { Chip, type ChipTone } from '@pump/ui';
import { badgeTone, type BadgeTone } from './tones.js';

export { badgeTone, type BadgeTone };

/** The mobile tone names, mapped onto the design system's `Chip` tones. */
const TONE = {
  good: 'success',
  warn: 'warning',
  bad: 'danger',
  info: 'info',
  muted: 'neutral',
} as const satisfies Record<BadgeTone, ChipTone>;

type Props = {
  /** Put figures in the mono face (a variance amount). */
  num?: boolean;
} & (
  | {
      /** A shared-vocabulary state (#518): its canonical word and tone, as on desktop. */
      state: PumpState;
      tone?: never;
      children?: never;
    }
  | { state?: never; tone?: BadgeTone; children: React.ReactNode }
);

/**
 * Small pill for a state. Pass `state` for a vocabulary state (Recorded,
 * Closed, Inactive, Over limit …) so it reads exactly as on desktop; pass
 * `tone` + text only for a figure (Balanced, +₹120) or a mobile-only note.
 */
export const StatusBadge: React.FC<Props> = (props) => {
  const p = props.state ? statusPresentation(props.state) : null;
  // A vocabulary state's shared tone is already a Chip tone: no round trip.
  const tone: ChipTone = p ? p.tone : TONE[props.tone ?? 'muted'];
  return (
    <Chip
      tone={tone}
      className={`text-[10.5px] font-bold ${props.num ? 'num' : ''} ${p?.struck ? 'line-through' : ''}`}
    >
      {p ? p.label : props.children}
    </Chip>
  );
};
