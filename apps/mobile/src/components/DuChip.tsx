import React from 'react';

/**
 * A Dispenser Unit's name as a small square chip. The name is real text, not
 * decoration: it is the only place a row says which DU it is about, so screen
 * readers get it too (`title` carries the full name when the chip truncates).
 */
export const DuChip: React.FC<{ name: string }> = ({ name }) => (
  <span
    title={name}
    className="grid h-8 min-w-8 max-w-[64px] flex-shrink-0 place-items-center truncate rounded-[9px] border border-line bg-card-alt px-1.5 text-[11px] font-bold text-text-muted"
  >
    {name}
  </span>
);
