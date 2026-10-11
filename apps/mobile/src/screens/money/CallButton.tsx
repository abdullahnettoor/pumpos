import React from 'react';
import { PhoneIcon } from '../../ui/icons.js';

/** Call button: a real `tel:` link, styled like the header `IconButton`. */
export const CallButton: React.FC<{ name: string; phone: string }> = ({ name, phone }) => (
  <a
    href={`tel:${phone.replace(/[^\d+]/g, '')}`}
    aria-label={`Call ${name}`}
    className="hit-44 grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] border border-line bg-card text-text-muted"
  >
    <PhoneIcon size={17} />
  </a>
);
