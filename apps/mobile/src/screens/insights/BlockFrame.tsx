import React from 'react';
import { SectionLabel } from '../../ui/index.js';
import { StateCard } from '../../ui/StateCard.js';

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
      <StateCard kind="error" onRetry={onRetry}>
        Could not load {title.toLowerCase()}.
      </StateCard>
    ) : !loaded ? (
      <StateCard kind="loading">Loading…</StateCard>
    ) : empty ? (
      <StateCard kind="empty">{empty}</StateCard>
    ) : (
      children
    )}
  </section>
);
