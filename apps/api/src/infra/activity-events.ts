import { and, eq } from 'drizzle-orm';
import { schema } from '@pump/db';
import type { EventTone } from '@pump/core';
import {
  readActivityMetadata,
  renderActivityFallback,
  resolveActivityActor,
  type ActivityActor,
  type ActivityGroupingRole,
} from './activity.js';

export type ActivityEventRow = {
  eventId: string;
  eventType: string;
  stationId: string | null;
  stationName: string | null;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  recordedAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  correlationId: string | null;
  causationId: string | null;
  metadata: unknown;
};

export interface ActivityEvent {
  eventId: string;
  eventType: string;
  stationId: string | null;
  stationName: string | null;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  recordedAt: Date;
  correlationId: string | null;
  causationId: string | null;
  groupingRole: ActivityGroupingRole | null;
  actor: ActivityActor;
  title: string;
  description: string;
  tone: EventTone;
  renderStatus: 'rendered' | 'fallback';
}

export interface ActivityGroupSummary {
  groupId: string;
  primary: ActivityEvent;
  relatedCount: number;
  primaryRecordedAt: Date;
  isLegacy: boolean;
}

export const activityEventFields = {
  eventId: schema.events.eventId,
  eventType: schema.events.eventType,
  stationId: schema.events.stationId,
  stationName: schema.stations.name,
  aggregateType: schema.events.aggregateType,
  aggregateId: schema.events.aggregateId,
  occurredAt: schema.events.occurredAt,
  recordedAt: schema.events.recordedAt,
  actorId: schema.events.actorId,
  actorName: schema.users.fullName,
  actorEmail: schema.users.email,
  correlationId: schema.events.correlationId,
  causationId: schema.events.causationId,
  metadata: schema.events.metadata,
};

export function formatActivityEvent(row: ActivityEventRow, isLegacy = false): ActivityEvent {
  const metadata = readActivityMetadata(row.metadata);
  const rendered = renderActivityFallback({ eventType: row.eventType, metadata: row.metadata });
  return {
    eventId: row.eventId,
    eventType: row.eventType,
    stationId: row.stationId,
    stationName: row.stationName,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    correlationId: row.correlationId,
    causationId: row.causationId,
    groupingRole: isLegacy ? 'primary' : metadata.groupingRole,
    actor: resolveActivityActor(row.metadata, row.actorId, {
      fullName: row.actorName,
      email: row.actorEmail,
    }),
    title: rendered.title,
    description: rendered.description,
    tone: rendered.tone,
    renderStatus: rendered.renderStatus,
  };
}

export function activityJoins(organizationId: string) {
  return {
    station: and(
      eq(schema.stations.id, schema.events.stationId),
      eq(schema.stations.organizationId, organizationId),
    ),
    actor: and(
      eq(schema.users.id, schema.events.actorId),
      eq(schema.users.organizationId, organizationId),
    ),
  };
}
