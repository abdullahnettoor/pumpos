import React from 'react';

export interface ReportNoteProps {
  children: React.ReactNode;
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
export const ReportNote: React.FC<ReportNoteProps> = ({ children }) => (
  <p
    style={{
      margin: 0,
      fontSize: '11px',
      lineHeight: 1.45,
      color: 'var(--text-faint)',
      maxWidth: '78ch',
    }}
  >
    {children}
  </p>
);
