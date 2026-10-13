import React, { type HTMLAttributes, type ReactNode } from 'react';
import { Button } from '../button/index.js';
import { cn } from '../lib/cn.js';
import { Panel } from '../panel/index.js';
import { Skeleton } from '../skeleton/index.js';
import { isAccessRefusal } from './accessRefusal.js';

/**
 * The slice of a TanStack query result a Data Section needs. Pass the query
 * result itself; every field below is on it.
 *
 * A query counts as loading only while `isPending` and `fetchStatus` is not
 * `'idle'`. TanStack v5 keeps a disabled query `isPending` forever with
 * `fetchStatus: 'idle'` — that is "not yet requested", not loading. A query
 * paused offline (`fetchStatus: 'paused'`) still counts as loading: it has no
 * answer yet, so it must never show the empty state.
 */
export interface SectionQuery {
  isPending: boolean;
  isError: boolean;
  /** `'fetching'` / `'paused'` = a request is wanted; `'idle'` = none is running. */
  fetchStatus: 'fetching' | 'paused' | 'idle';
  /** The failure, read to tell an access refusal (no Retry) from a fault. */
  error?: unknown;
  /** Re-runs the query. Without one, an error shows no Retry. */
  refetch?: () => unknown;
}

export type DataSectionState = 'loading' | 'error' | 'refused' | 'empty' | 'ready';

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
   * `card` (default): every state sits in a `Panel`. `cards`: loading and
   * error sit in a `Panel`, the ready content does not — for content that is
   * itself one or more bordered cards. `bare`: no frame, for a table or list
   * region that already sits in its own surface.
   */
  shape?: 'card' | 'cards' | 'bare';
  /**
   * Gating. `false` renders nothing; give the same flag to the queries'
   * `enabled` so a hidden section never sends a request. Passing `true` also
   * says the section is meant to show: a query not yet requested (pending,
   * idle — e.g. waiting on a dependency) then shows the skeleton. Omitted,
   * such a section renders nothing until a request starts.
   */
  enabled?: boolean;
  /** Card only: Panel footer and flush body, when ready. */
  footer?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}

const asList = (q: DataSectionProps['query']): SectionQuery[] =>
  q === undefined ? [] : Array.isArray(q) ? q : [q];

const isLoading = (q: SectionQuery) => q.isPending && q.fetchStatus !== 'idle';
const isUnrequested = (q: SectionQuery) => q.isPending && q.fetchStatus === 'idle';

/**
 * DataSection — one region of a screen that loads its own data, with its own
 * loading, error and empty states. A failing request affects only its section:
 * there is no page-level spinner or error.
 *
 * - every failed query refused (403 / access policy) → the refusal message,
 *   no Retry
 * - any other failure, alone or mixed with refusals → "Couldn't load <title>
 *   · Retry" (Retry refetches only the failed queries that can be retried, not
 *   the refused ones). Never the empty state: a failed query is not "empty".
 * - fetching or paused offline → a skeleton sized like the body
 * - not yet requested → nothing (the skeleton when `enabled` is passed `true`)
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
  enabled,
  footer,
  flush,
  className,
  children,
  ...rest
}) => {
  if (enabled === false) return null;

  const queries = asList(query);
  const failed = queries.filter((q) => q.isError);
  const refused = failed.filter((q) => isAccessRefusal(q.error));
  const waiting = queries.some(isUnrequested);
  if (failed.length === 0 && !queries.some(isLoading) && waiting && enabled !== true) {
    return null;
  }

  // Refused only when nothing else failed: a refusal message beside a Retry
  // would read as "retrying may grant access".
  const state: DataSectionState =
    failed.length > 0 && refused.length === failed.length
      ? 'refused'
      : failed.length > 0
        ? 'error'
        : queries.some(isLoading) || waiting
          ? 'loading'
          : isEmpty && empty !== undefined
            ? 'empty'
            : 'ready';

  const label = title.toLowerCase();
  const ready = state === 'ready' || state === 'empty';
  const framed = shape === 'card' || (shape === 'cards' && !ready);

  const body =
    state === 'refused' || state === 'error' ? (
      <ErrorRow label={label} failed={failed} refused={refused} allRefused={state === 'refused'} />
    ) : state === 'loading' ? (
      <Skeleton aria-label={`Loading ${label}`} height={placeholderHeight} />
    ) : state === 'empty' ? (
      empty
    ) : (
      children
    );

  const rootProps = {
    'data-state': state,
    'aria-busy': state === 'loading' ? true : undefined,
    ...rest,
  };

  if (framed) {
    return (
      <Panel
        footer={ready ? footer : undefined}
        flush={ready ? flush : undefined}
        className={className}
        {...rootProps}
      >
        {body}
      </Panel>
    );
  }

  return (
    <div
      className={cn(
        shape === 'bare' && (state === 'error' || state === 'refused') && 'p-4',
        className,
      )}
      {...rootProps}
    >
      {body}
    </div>
  );
};

const refusalMessage = (q: SectionQuery, label: string): string => {
  const message = (q.error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && message.trim()
    ? message
    : `You don't have access to ${label}.`;
};

const ErrorRow: React.FC<{
  label: string;
  failed: SectionQuery[];
  refused: SectionQuery[];
  allRefused: boolean;
}> = ({ label, failed, refused, allRefused }) => {
  // A refusal can't be retried away; only genuine faults get Retry.
  const retryable = failed.filter((q) => q.refetch && !refused.includes(q));
  const text = allRefused ? refusalMessage(refused[0], label) : `Couldn't load ${label}`;
  return (
    <div className="flex items-center gap-3 text-[12.5px] text-ink-muted" role="alert">
      <span>
        {text}
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
