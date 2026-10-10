import React from 'react';
import { useBack } from './backStack.js';
import { BackIcon } from './icons.js';
import { IconButton } from './IconButton.js';

interface Props {
  title: string;
  subtitle?: string;
  /** A `StatusBadge` or an `IconButton`. */
  right?: React.ReactNode;
}

/** Header of a pushed detail page: back button, title, one-line subtitle. */
export const DetailHeader: React.FC<Props> = ({ title, subtitle, right }) => {
  const back = useBack();
  return (
    <header className="flex items-center gap-2.5 px-3.5 pb-3 pt-1">
      <IconButton label="Back" onClick={back} className="!text-text-high">
        <BackIcon size={18} strokeWidth={2.2} />
      </IconButton>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-extrabold tracking-[-0.02em] text-text-high">
          {title}
        </h1>
        {subtitle && <p className="mt-px truncate text-[11.5px] text-text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
};
