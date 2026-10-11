import React from 'react';

/** Full-width secondary button under a list ("See all 12 customers"). */
export const SeeAllButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ onClick, children, disabled }) => (
  <div className="px-3 pt-2.5">
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 w-full rounded-[13px] border border-line bg-card text-[13.5px] font-bold text-text-high disabled:opacity-60"
    >
      {children}
    </button>
  </div>
);
