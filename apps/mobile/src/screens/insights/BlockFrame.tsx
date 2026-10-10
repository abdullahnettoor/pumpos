import React from 'react';
import { SectionLabel } from '../../ui/index.js';

interface Props {
  title: string;
  right?: string;
  isError: boolean;
  /** Undefined while the first read is in flight. */
  loaded: boolean;
  onRetry: () => void;
  /** Set to the empty-state text when the block has nothing to show. */
  empty?: string;
  children: React.ReactNode;
}

const Card: React.FC<{ children: React.ReactNode; tone?: 'plain' | 'error' }> = ({
  children,
  tone = 'plain',
}) => (
  <p
    className={`mx-3 rounded-[14px] border px-3 py-4 text-center text-xs ${
      tone === 'error'
        ? 'border-bad-line bg-bad-soft text-bad-fg'
        : 'border-line bg-card text-text-muted'
    }`}
  >
    {children}
  </p>
);

/**
 * One Insights block with its own section label and its own loading, error and
 * empty states: the blocks are separate reads, so one failing (or still
 * loading) never blanks the others.
 */
export const BlockFrame: React.FC<Props> = ({
  title,
  right,
  isError,
  loaded,
  onRetry,
  empty,
  children,
}) => (
  <section aria-label={title}>
    <SectionLabel right={right}>{title}</SectionLabel>
    {isError ? (
      <Card tone="error">
        Could not load {title.toLowerCase()}.{' '}
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Retry
        </button>
      </Card>
    ) : !loaded ? (
      <Card>Loading…</Card>
    ) : empty ? (
      <Card>{empty}</Card>
    ) : (
      children
    )}
  </section>
);
