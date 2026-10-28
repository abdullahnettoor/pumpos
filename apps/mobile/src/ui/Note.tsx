import React from 'react';

/** Muted one-line state: loading, empty, no match. */
export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-4 py-8 text-center text-[13px] text-text-muted">{children}</p>
);
