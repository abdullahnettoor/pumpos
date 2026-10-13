import React, { type HTMLAttributes, type ReactNode } from 'react';
import { Button } from '../button/index.js';
import { cn } from '../lib/cn.js';
import { Panel } from '../panel/index.js';
import { Skeleton } from '../skeleton/index.js';

/** The slice of a TanStack query result a Data Section needs. */
export interface SectionQuery {
  isPending: boolean;
  isError: boolean;
  /** Re-runs the query. Without one, an error shows no Retry. */
  refetch?: () => unknown;
}

export type DataSectionState = 'loading' | 'error' | 'empty' | 'ready';

export interface DataSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Names the section in the error ("Couldn't load <title>") and loading label. */
  title: string;
  /** The section's own query, or all of them. Omit for sections with no data. */
  query?: SectionQuery | SectionQuery[];
  /** True when every query succeeded but there is nothing to show. */
  isEmpty?: boolean;
  /** Shown instead of `children` when `isEmpty` (only after success, never on error). */
  empty?: ReactNode;
  /** Body height (px) at rest, so the skeleton doesn't shift the layout. */
  placeholderHeight: number;
  /**
   * `card` (default): every state sits in a `Panel`. `bare`: no frame, for a
   * table or list region that already sits in its own surface.
   */
  shape?: 'card' | 'bare';
  /**
   * Card only. `false` drops the Panel once the content is ready, for content
   * that is itself one or more bordered cards; loading and error keep the
   * bordered footprint.
   */
  frameWhenReady?: boolean;
  /**
   * Gating. `false` renders nothing; give the same flag to the queries'
   * `enabled` so a hidden section never sends a request.
   */
  enabled?: boolean;
  /** Card only: Panel footer and flush body, when ready. */
  footer?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}

const asList = (q: DataSectionProps['query']): SectionQuery[] =>
  q === undefined ? [] : Array.isArray(q) ? q : [q];

/**
 * DataSection — one region of a screen that loads its own data, with its own
 * loading, error and empty states. A failing request affects only its section:
 * there is no page-level spinner or error.
 *
 * - pending → a skeleton sized like the body
 * - any query errored → "Couldn't load <title> · Retry" (Retry refetches only
 *   the failed queries). Never the empty state: a failed query is not "empty".
 * - all succeeded and `isEmpty` → `empty`
 * - otherwise → `children`
 */
export const DataSection: React.FC<DataSectionProps> = ({
  title,
  query,
  isEmpty = false,
  empty,
  placeholderHeight,
  shape = 'card',
  frameWhenReady = true,
  enabled = true,
  footer,
  flush,
  className,
  children,
  ...rest
}) => {
  if (!enabled) return null;

  const queries = asList(query);
  const failed = queries.filter((q) => q.isError);
  const state: DataSectionState =
    failed.length > 0
      ? 'error'
      : queries.some((q) => q.isPending)
        ? 'loading'
        : isEmpty && empty !== undefined
          ? 'empty'
          : 'ready';

  const label = title.toLowerCase();
  const framed = shape === 'card' && (frameWhenReady || state === 'loading' || state === 'error');
  const ready = state === 'ready' || state === 'empty';

  const body =
    state === 'error' ? (
      <ErrorRow label={label} failed={failed} />
    ) : state === 'loading' ? (
      <Skeleton aria-label={`Loading ${label}`} height={placeholderHeight} />
    ) : state === 'empty' ? (
      empty
    ) : (
      children
    );

  if (framed) {
    return (
      <Panel
        footer={ready ? footer : undefined}
        flush={ready ? flush : undefined}
        className={className}
        data-state={state}
        {...rest}
      >
        {body}
      </Panel>
    );
  }

  return (
    <div
      className={cn(shape === 'bare' && !ready && 'p-4', className)}
      data-state={state}
      {...rest}
    >
      {body}
    </div>
  );
};

const ErrorRow: React.FC<{ label: string; failed: SectionQuery[] }> = ({ label, failed }) => {
  const retryable = failed.filter((q) => q.refetch);
  return (
    <div className="flex items-center gap-3 text-[12.5px] text-ink-muted" role="alert">
      <span>
        Couldn&apos;t load {label}
        {retryable.length > 0 && ' ·'}
      </span>
      {retryable.length > 0 && (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => Promise.all(retryable.map((q) => q.refetch!()))}
        >
          Retry
        </Button>
      )}
    </div>
  );
};
