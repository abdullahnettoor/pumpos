import React from 'react';
import { initialsOf } from '@pump/ui';

const SIZE = {
  /** In a stacked group of people. */
  sm: 'h-[30px] w-[30px] border-2 border-card text-[11px]',
  md: 'h-[34px] w-[34px] text-[11px]',
  lg: 'h-11 w-11 text-[15px]',
} as const;

interface Props {
  /** A person's name; the chip shows their initials. */
  name?: string;
  /** Replaces the initials ("+2" for the rest of a group). */
  text?: string;
  size?: keyof typeof SIZE;
  /** Tuck under the previous avatar of a stacked group. */
  overlap?: boolean;
}

/** Round initials chip for a person. Decorative: put the accessible name on the control around it. */
export const Avatar: React.FC<Props> = ({ name = '', text, size = 'md', overlap }) => (
  <span
    className={`grid flex-shrink-0 place-items-center rounded-full bg-accent-soft font-extrabold text-accent ${SIZE[size]} ${overlap ? '-ml-2' : ''}`}
  >
    {text ?? initialsOf(name)}
  </span>
);
