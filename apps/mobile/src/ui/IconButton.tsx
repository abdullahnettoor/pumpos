import React from 'react';

interface Props extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Icon-only, so the accessible name is required. */
  label: string;
}

/** 34px square header action (calendar, search, call). */
export const IconButton: React.FC<Props> = ({ label, className = '', children, ...rest }) => (
  <button
    type="button"
    aria-label={label}
    className={`relative grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] border border-line bg-card text-text-muted ${className}`}
    {...rest}
  >
    {children}
  </button>
);
