import React from 'react';
import type { DashboardCard as CardId } from '@pump/shared';
import { DataSection, type SectionQuery } from '../../../pump-ds/index.js';
import { useCardEnabled } from './DashboardContext.js';

/** The slice of a TanStack query result the wrapper needs. */
export type CardQuery = SectionQuery;

export interface DashboardCardProps {
  /** Gating-table id. The card renders nothing when the role can't see it. */
  card: CardId;
  /** Shown in the error text ("Couldn't load <title>") and loading label. */
  title: string;
  /**
   * The card's own query (or all of them). Pending → placeholder, error →
   * "Couldn't load … · Retry" (retries only the failed ones). Omit for cards
   * with no data of their own.
   */
  query?: CardQuery | CardQuery[];
  /**
   * Body height (px) of the real card at rest, so the placeholder doesn't
   * shift the layout when data lands.
   */
  placeholderHeight: number;
  footer?: React.ReactNode;
  flush?: boolean;
  /**
   * `card` (default): headerless, ONE bordered surface; the column's
   * `SectionHeader` carries the section title. `plain`: no frame when ready,
   * for cards whose content is itself one or more bordered cards (Forecourt
   * blocks, one card per fuel); loading/error keep a bordered footprint.
   */
  variant?: 'card' | 'plain';
  children: React.ReactNode;
}

/**
 * A dashboard card: a `DataSection` gated by the dashboard's card table. One
 * card failing never affects another; there is no page-level loading or error.
 *
 * Pass the same `card` id to `useCardEnabled(card)` for the query's `enabled`.
 */
export const DashboardCard: React.FC<DashboardCardProps> = ({
  card,
  variant = 'card',
  ...props
}) => {
  const enabled = useCardEnabled(card);
  return (
    <DataSection
      {...props}
      enabled={enabled}
      shape={variant === 'plain' ? 'cards' : 'card'}
      data-dashboard-card={card}
    />
  );
};
