import React from 'react';
import { PageHeader as DsPageHeader } from '@pump/ui';
import { PinnedHeader } from './PinnedHeader.js';

interface Props {
  title: string;
  /** Page actions on the right (an `IconButton`, a segmented toggle). */
  right?: React.ReactNode;
  /** Shown above the title; tapping it calls `onStationPress`. */
  stationName: string;
  onStationPress: () => void;
}

/**
 * Header of a tab's own screen: the station name above a large title, with page
 * actions on the right, pinned to the top of its pane (`PinnedHeader`). The design system's `PageHeader` at mobile scale. Tab roots
 * use the shell's `TabHeader`, which wires the station button to the Account sheet;
 * Home uses `HomeHeader`.
 */
export const PageHeader: React.FC<Props> = ({ title, right, stationName, onStationPress }) => (
  <PinnedHeader>
    <DsPageHeader
      className="flex-nowrap items-center px-4 pb-3 pt-1.5 [&_h1]:truncate [&_h1]:text-[22px] [&_h1]:font-extrabold [&_h1]:tracking-[-0.03em] [&_h1]:text-text-high"
      eyebrow={
        <button
          type="button"
          onClick={onStationPress}
          aria-label={`${stationName}, open account`}
          data-station-button=""
          className="block max-w-full truncate text-left text-[11px] font-semibold text-text-muted"
        >
          {stationName}
        </button>
      }
      title={title}
      actions={right}
    />
  </PinnedHeader>
);
