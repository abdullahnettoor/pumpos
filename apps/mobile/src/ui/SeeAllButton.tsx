import React from 'react';

/** Full-width secondary button under a list ("See all 12 customers"). */
export const SeeAllButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({
  onClick,
  children,
}) => (
  <div className="px-3 pt-2.5">
    <button
      type="button"
      onClick={onClick}
      className="h-11 w-full rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-text-high"
    >
      {children}
    </button>
  </div>
);
