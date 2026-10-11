import React from 'react';
import { ActionBar, type ActionSlot } from './ActionBar.js';
import { DetailHeader } from './DetailHeader.js';

interface Props {
  title: string;
  subtitle?: string;
  /** Header right slot: a `StatusBadge` or `IconButton`. */
  right?: React.ReactNode;
  share?: ActionSlot;
  download?: ActionSlot;
  /** Custom bottom bar content in place of Share / Download. */
  actions?: React.ReactNode;
  onActionError?: (message: string) => void;
  children: React.ReactNode;
}

/**
 * The frame of every pushed detail page: header with back, content, and the
 * bottom action bar that replaces the dock. Pass `share` / `download` for the
 * standard PDF actions; with neither (and no `actions`) there is no bar.
 *
 *   nav.push(<ShiftSummaryPage id={id} />, `shift:${id}`)
 *   // ...and ShiftSummaryPage renders
 *   <DetailPage title="Shift 1 summary" subtitle="Fri 9 Oct" share={...} download={...}>
 */
export const DetailPage: React.FC<Props> = ({
  title,
  subtitle,
  right,
  share,
  download,
  actions,
  onActionError,
  children,
}) => (
  <div className="flex min-h-full flex-col">
    <DetailHeader title={title} subtitle={subtitle} right={right} />
    <div className="flex-1 pb-4">{children}</div>
    {(share || download || actions) && (
      <ActionBar share={share} download={download} onError={onActionError}>
        {actions}
      </ActionBar>
    )}
  </div>
);
