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
  children: React.ReactNode;
}

/**
 * Frame for a dashboard card: gating, a placeholder the size of the real card,
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
  children,
}) => {
  const visible = useCardEnabled(card);
  if (!visible) return null;

  const queries = query === undefined ? [] : Array.isArray(query) ? query : [query];
  const failed = queries.filter((q) => q.isError);
  const pending = failed.length === 0 && queries.some((q) => q.isPending);

  if (failed.length > 0) {
    return (
      <Panel title={title} icon={icon} data-dashboard-card={card} data-state="error">
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
      <Panel title={title} icon={icon} data-dashboard-card={card} data-state="loading">
        <div
          aria-busy="true"
          aria-label={`Loading ${title.toLowerCase()}`}
          className="animate-pulse rounded-input bg-surface-alt"
          style={{ height: placeholderHeight }}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title={title}
      icon={icon}
      action={action}
      footer={footer}
      flush={flush}
      data-dashboard-card={card}
      data-state="ready"
    >
      {children}
    </Panel>
  );
};
