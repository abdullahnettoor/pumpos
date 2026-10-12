import React from 'react';
import type { DashboardCard as CardId } from '@pump/shared';
import { Button, Panel } from '../../../pump-ds/index.js';
import { useCardEnabled } from './DashboardContext.js';

/** The slice of a TanStack query result the wrapper needs. */
export interface CardQuery {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}

export interface DashboardCardProps {
  /** Gating-table id. The card renders nothing when the role can't see it. */
  card: CardId;
  /** Shown in the header and the error text ("Couldn't load <title>"). */
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
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
   * `ColumnHeader` carries the section title. `plain`: no frame when ready,
   * for cards whose content is itself one or more bordered cards (Forecourt
   * blocks, one card per fuel); loading/error keep a bordered footprint.
   * `panel`: legacy titled Panel (own uppercase header + action), for cards
   * not under a column header (the full-width timeline).
   */
  variant?: 'card' | 'plain' | 'panel';
  children: React.ReactNode;
}

/**
 * Frame for a dashboard card (see `variant`): gating, a placeholder the size of the real card,
 * and a per-card error state. There is no page-level loading or error state;
 * one card failing never affects another.
 *
 * Pass the same `card` id to `useCardEnabled(card)` for the query's `enabled`.
 */
export const DashboardCard: React.FC<DashboardCardProps> = ({
  card,
  title,
  icon,
  action,
  query,
  placeholderHeight,
  footer,
  flush,
  variant = 'card',
  children,
}) => {
  const headed = variant === 'panel';
  const headerProps = headed ? { title, icon } : {};
  const visible = useCardEnabled(card);
  if (!visible) return null;

  const queries = query === undefined ? [] : Array.isArray(query) ? query : [query];
  const failed = queries.filter((q) => q.isError);
  const pending = failed.length === 0 && queries.some((q) => q.isPending);

  if (failed.length > 0) {
    return (
      <Panel {...headerProps} data-dashboard-card={card} data-state="error">
        <div className="flex items-center gap-3 text-[12.5px] text-ink-muted" role="alert">
          <span>Couldn&apos;t load {title.toLowerCase()} ·</span>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => failed.forEach((q) => void q.refetch())}
          >
            Retry
          </Button>
        </div>
      </Panel>
    );
  }

  if (pending) {
    return (
      <Panel {...headerProps} data-dashboard-card={card} data-state="loading">
        <div
          aria-busy="true"
          aria-label={`Loading ${title.toLowerCase()}`}
          className="animate-pulse rounded-input bg-surface-alt"
          style={{ height: placeholderHeight }}
        />
      </Panel>
    );
  }

  if (variant === 'plain') {
    return (
      <div data-dashboard-card={card} data-state="ready">
        {children}
      </div>
    );
  }

  return (
    <Panel
      {...headerProps}
      action={headed ? action : undefined}
      footer={footer}
      flush={flush}
      data-dashboard-card={card}
      data-state="ready"
    >
      {children}
    </Panel>
  );
};
