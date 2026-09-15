import React, { useState } from 'react';
import { Station } from '@pump/shared';
import { useActivityGroup, useActivityGroups } from '../../query/hooks.js';
import { Select } from '../primitives/Field.js';
import { Panel } from '../../pump-ds/index.js';
import type { ActivityEventItem, ActivityTone } from '../../services/cloud.js';

const TONE_STYLE: Record<ActivityTone, { bg: string; fg: string }> = {
  info: { bg: 'var(--state-info-bg)', fg: 'var(--state-info-fg)' },
  success: { bg: 'var(--state-success-bg)', fg: 'var(--state-success-fg)' },
  warning: { bg: 'var(--state-warning-bg)', fg: 'var(--state-warning-fg)' },
  danger: { bg: 'var(--state-danger-bg)', fg: 'var(--state-danger-fg)' },
  default: { bg: 'var(--bg-surface-alt)', fg: 'var(--text-muted)' },
};

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

export interface ActivityFeedProps {
  stations: Station[];
}

/**
 * Human-readable business-event activity feed (Owner-only, org-scoped). Each row
 * shows a readable label + the raw event type tag, with station / actor / time.
 * Reads from GET /events; filter by station.
 */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({ stations }) => {
  const [stationId, setStationId] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const activity = useActivityGroups({ stationId: stationId || undefined, limit: 50 });
  const detail = useActivityGroup(expandedGroupId);
  const groups = activity.data?.pages.flatMap((page) => page.items) ?? [];

  const toggleGroup = (groupId: string) => {
    setExpandedGroupId((current) => (current === groupId ? null : groupId));
  };

  const renderRelated = (event: ActivityEventItem, primary: ActivityEventItem) => {
    const actorChanged =
      event.actor.kind !== primary.actor.kind ||
      event.actor.id !== primary.actor.id ||
      event.actor.displayName !== primary.actor.displayName;
    return (
      <li
        key={event.eventId}
        style={{ padding: '8px 0', borderTop: '1px solid var(--border-soft)' }}
      >
        <div style={{ fontSize: '12px', color: 'var(--text-strong)' }}>{event.description}</div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '3px',
            fontSize: '10px',
            color: 'var(--text-muted)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>
            {event.eventType}
          </span>
          {actorChanged && <span>by {event.actor.displayName}</span>}
        </div>
      </li>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', maxWidth: 260 }}>
        <Select
          className="input-compact"
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
        >
          <option value="">All stations</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {activity.isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading activity…</div>
      ) : activity.error ? (
        <div style={{ color: 'var(--state-danger-fg)', fontSize: '13px' }}>
          Failed to load activity.
        </div>
      ) : groups.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          No activity recorded yet.
        </div>
      ) : (
        <Panel flush title="Recent activity">
          {groups.map((group, i) => {
            const { primary } = group;
            const tone = TONE_STYLE[primary.tone];
            const isExpanded = expandedGroupId === group.groupId;
            const detailId = `activity-group-${group.groupId}`;
            const meta = [primary.stationName, `by ${primary.actor.displayName}`]
              .filter(Boolean)
              .join(' · ');
            return (
              <div
                key={group.groupId}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '11px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: tone.fg,
                    marginTop: '5px',
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-strong)', fontWeight: 500 }}>
                    {primary.description}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '3px',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--text-faint)',
                        flexShrink: 0,
                      }}
                    >
                      {primary.eventType}
                    </span>
                    {meta && (
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        · {meta}
                      </span>
                    )}
                  </div>
                  {group.relatedCount > 0 && (
                    <>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={detailId}
                        onClick={() => toggleGroup(group.groupId)}
                        style={{
                          marginTop: '7px',
                          padding: 0,
                          border: 0,
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {isExpanded ? 'Hide' : 'Show'} {group.relatedCount} related event
                        {group.relatedCount === 1 ? '' : 's'}
                      </button>
                      {isExpanded && (
                        <div
                          id={detailId}
                          style={{
                            marginTop: '8px',
                            paddingLeft: '12px',
                            borderLeft: `2px solid ${tone.fg}`,
                          }}
                        >
                          {detail.isLoading ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                              Loading related activity…
                            </div>
                          ) : detail.error ? (
                            <div style={{ color: 'var(--state-danger-fg)', fontSize: '11px' }}>
                              Failed to load related activity.
                            </div>
                          ) : detail.data ? (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                              {detail.data.related.map((event) => renderRelated(event, primary))}
                            </ul>
                          ) : null}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: '11px',
                    color: 'var(--text-faint)',
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap',
                    marginTop: '1px',
                  }}
                >
                  {fmtTime(primary.recordedAt)}
                </span>
              </div>
            );
          })}
          {activity.hasNextPage && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-soft)' }}>
              <button
                type="button"
                onClick={() => activity.fetchNextPage()}
                disabled={activity.isFetchingNextPage}
                style={{
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {activity.isFetchingNextPage ? 'Loading…' : 'Load more activity'}
              </button>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
};
