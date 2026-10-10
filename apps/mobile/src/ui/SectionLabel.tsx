import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Small accent text on the right ("3", "See all ›"). */
  right?: React.ReactNode;
}

/** Uppercase divider above a group of rows or tiles. */
export const SectionLabel: React.FC<Props> = ({ children, right }) => (
  <div className="flex items-baseline justify-between px-4 pb-2 pt-[18px]">
    <h2 className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-text-muted">
      {children}
    </h2>
    {right && <span className="text-[11px] font-semibold text-accent">{right}</span>}
  </div>
);
