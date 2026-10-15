import React, { useMemo, useState } from 'react';
import { Station } from '@pump/shared';
import { useActivityGroup, useActivityGroups } from '../../query/hooks.js';
import {
  Button,
  DataSection,
  Dot,
  EmptyState,
  FilterChips,
  Icon,
  Select,
  SectionHeader,
  type DotTone,
  type FilterChipOption,
} from '../../pump-ds/index.js';
import type {
  ActivityEventItem,
  ActivityGroupSummary,
  ActivityTone,
} from '../../services/cloud.js';
import { formatClockInZone } from '../../utils/format.js';
import { useRunTask } from '../../utils/runTask.js';
import { groupActivityByDay } from './organizationModel.js';

/** An event's tone as its row marker; `default` is plain information. */
const DOT_TONE: Record<ActivityTone, DotTone> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  default: 'neutral',
};

/** Up to this many options the station filter is chips; past it, a dropdown. */
const MAX_STATION_CHIPS = 4;

export interface ActivityFeedProps {
  stations: Station[];
  /** The active Station's timezone: days and times read in it, not the browser's. */
  timeZone?: string;
}

const RelatedEvent: React.FC<{ event: ActivityEventItem; primary: ActivityEventItem }> = ({
  event,
  primary,
}) => {
  const actorChanged =
    event.actor.kind !== primary.actor.kind ||
    event.actor.id !== primary.actor.id ||
    event.actor.displayName !== primary.actor.displayName;
  return (
    <li className="list-none border-t border-border-soft py-2 first:border-t-0">
      <div className="text-[12px] text-ink-strong">{event.description}</div>
      <div className="mt-0.5 flex gap-2 text-[12px] text-ink-muted">
        <span className="font-mono text-ink-faint">{event.eventType}</span>
        {actorChanged && <span>by {event.actor.displayName}</span>}
      </div>
    </li>
  );
};

const ActivityRow: React.FC<{
  group: ActivityGroupSummary;
  expanded: boolean;
  onToggle: () => void;
  timeZone?: string;
}> = ({ group, expanded, onToggle, timeZone }) => {
  const { primary } = group;
  const detail = useActivityGroup(expanded ? group.groupId : null);
  const detailId = `activity-group-${group.groupId}`;
  const meta = [primary.stationName, `by ${primary.actor.displayName}`].filter(Boolean).join(' · ');
  return (
    <li className="flex items-start gap-3 border-t border-border-soft px-4 py-2.5 first:border-t-0">
      <Dot tone={DOT_TONE[primary.tone]} size="md" className="mt-1.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-ink-strong">{primary.description}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-ink-muted">
          <span className="shrink-0 font-mono text-ink-faint">{primary.eventType}</span>
          {meta && <span className="truncate">· {meta}</span>}
        </div>
        {group.relatedCount > 0 && (
          <>
            <Button
              variant="ghost"
              size="xs"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={onToggle}
              className="mt-1 h-auto px-0 text-ink-muted hover:bg-transparent hover:text-ink-strong"
            >
              {expanded ? 'Hide' : 'Show'} {group.relatedCount} related event
              {group.relatedCount === 1 ? '' : 's'}
            </Button>
            {expanded && (
              <div id={detailId} className="mt-1 border-l-2 border-border-strong pl-3">
                <DataSection
                  title="related activity"
                  query={detail}
                  shape="bare"
                  placeholderHeight={48}
                >
                  <ul className="m-0 list-none p-0">
                    {detail.data?.related.map((event) => (
                      <RelatedEvent key={event.eventId} event={event} primary={primary} />
                    ))}
                  </ul>
                </DataSection>
              </div>
            )}
          </>
        )}
      </div>
      <span className="shrink-0 whitespace-nowrap font-mono text-[12px] text-ink-faint">
        {formatClockInZone(primary.recordedAt, timeZone)}
      </span>
    </li>
  );
};

/**
 * Organization › Activity (#538): the business-event feed (Owner-only,
 * org-scoped) in day groups, by the active Station's calendar and clock. The station filter sits in the feed's header;
 * each day heading carries the date, so a row shows only its time.
 */
export const ActivityFeed: React.FC<ActivityFeedProps> = ({ stations, timeZone }) => {
  const runTask = useRunTask();
  const [stationId, setStationId] = useState('');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const activity = useActivityGroups({ stationId: stationId || undefined, limit: 50 });
  const groups = useMemo(
    () => activity.data?.pages.flatMap((page) => page.items) ?? [],
    [activity.data],
  );
  const days = useMemo(
    () => groupActivityByDay(groups, (g) => g.primary.recordedAt, { timeZone }),
    [groups, timeZone],
  );

  const toggleGroup = (groupId: string) =>
    setExpandedGroupId((current) => (current === groupId ? null : groupId));

  const stationFilter =
    stations.length + 1 <= MAX_STATION_CHIPS ? (
      <FilterChips
        aria-label="Show activity for"
        options={[
          { value: '', label: 'All stations' },
          ...stations.map(
            (s) => ({ value: s.id, label: s.name }) satisfies FilterChipOption<string>,
          ),
        ]}
        value={stationId}
        onChange={setStationId}
      />
    ) : (
      <div className="w-[200px]">
        <Select
          inputSize="sm"
          aria-label="Show activity for"
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
    );

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title="Recent activity"
        controls={{ filters: stations.length > 1 ? stationFilter : undefined }}
      />
      <DataSection
        title="activity"
        query={activity}
        placeholderHeight={360}
        flush
        isEmpty={groups.length === 0}
        empty={
          <div className="p-3">
            <EmptyState
              compact
              icon={<Icon name="activity" size="md" />}
              title="No activity recorded yet"
              description="Shifts, sales and office records appear here as they happen."
            />
          </div>
        }
        footer={
          activity.hasNextPage ? (
            <Button
              variant="ghost"
              size="sm"
              loading={activity.isFetchingNextPage}
              onClick={() => runTask(activity.fetchNextPage(), 'Could not load more activity.')}
            >
              Load more activity
            </Button>
          ) : undefined
        }
      >
        {days.map((day) => (
          <div key={day.key} className="border-t border-border-soft first:border-t-0">
            <h3 className="bg-surface-alt px-4 py-1.5 text-[12px] font-semibold text-ink-muted">
              {day.label}
            </h3>
            <ul className="m-0 list-none border-t border-border-soft p-0">
              {day.items.map((group) => (
                <ActivityRow
                  key={group.groupId}
                  group={group}
                  expanded={expandedGroupId === group.groupId}
                  onToggle={() => toggleGroup(group.groupId)}
                  timeZone={timeZone}
                />
              ))}
            </ul>
          </div>
        ))}
      </DataSection>
    </section>
  );
};
