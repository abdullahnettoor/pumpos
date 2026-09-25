import React from 'react';
import { cn } from '../../pump-ds/lib/cn.js';

export interface ReportNoteProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * ReportNote — the one way a report tab explains itself.
 *
 * Methodology caveats ("closed shifts only", "fuel VAT is outside GST") are
 * read once and then ignored, but they are the difference between a figure
 * being understood and being mistrusted — so they are stated in full, not
 * hidden behind a tooltip an accountant has to discover.
 *
 * They belong *under* the filter bar, never inside it: a sentence sitting in
 * the control row stretches the bar and pushes the controls out of alignment,
 * which is what this component exists to stop.
 */
export const ReportNote: React.FC<ReportNoteProps> = ({ children, className }) => (
  // max-w-[78ch]: a long caveat wraps as prose instead of running the width of
  // a desktop display, where the eye loses the line.
  <p className={cn('m-0 max-w-[78ch] text-[11px] leading-[1.45] text-ink-faint', className)}>
    {children}
  </p>
);
