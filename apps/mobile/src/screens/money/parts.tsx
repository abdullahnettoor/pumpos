import React from 'react';

/** Muted one-line state: loading, empty, no match. */
export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-4 py-8 text-center text-[13px] text-text-muted">{children}</p>
);

/** Full-width secondary button under a list. */
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
