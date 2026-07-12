import React, { useState } from 'react';
import { Station } from '@pump/shared';
import { useEvents } from '../../query/hooks.js';
import { Select } from '../primitives/Field.js';
import { Panel } from '../../pump-ds/index.js';
import { eventLabel, eventDetail, eventTone, type EventTone } from '../../utils/eventLog.js';

const TONE_STYLE: Record<EventTone, { bg: string; fg: string }> = {
  info: { bg: 'var(--state-info-bg)', fg: 'var(--state-info-fg)' },
  success: { bg: 'var(--state-success-bg)', fg: 'var(--state-success-fg)' },
  warning: { bg: 'var(--state-warning-bg)', fg: 'var(--state-warning-fg)' },
  danger: { bg: 'var(--state-danger-bg)', fg: 'var(--state-danger-fg)' },
  default: { bg: 'var(--bg-surface-alt)', fg: 'var(--text-muted)' },
};

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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
  const { data: events, isLoading, error } = useEvents({ stationId: stationId || undefined, limit: 100 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', maxWidth: 260 }}>
        <Select className="input-compact" value={stationId} onChange={(e) => setStationId(e.target.value)}>
          <option value="">All stations</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading activity…</div>
      ) : error ? (
        <div style={{ color: 'var(--state-danger-fg)', fontSize: '13px' }}>Failed to load activity.</div>
      ) : !events || events.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No activity recorded yet.</div>
      ) : (
        <Panel flush title="Recent activity">
          {events.map((ev: any, i: number) => {
            const tone = TONE_STYLE[eventTone(ev.eventType)];
            const detail = eventDetail(ev);
            const meta = [ev.stationName, ev.actorName].filter(Boolean).join(' · ');
            return (
              <div
                key={ev.id}
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
                  style={{ flexShrink: 0, width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tone.fg, marginTop: '5px' }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-strong)', fontWeight: 500 }}>
                    {eventLabel(ev.eventType)}
                    {detail && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {detail}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)', minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-faint)', flexShrink: 0 }}>{ev.eventType}</span>
                    {meta && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {meta}</span>}
                  </div>
                </div>
                <span style={{ flexShrink: 0, fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', marginTop: '1px' }}>
                  {fmtTime(ev.recordedAt)}
                </span>
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
};
