export type ActivityActorKind = 'tenant_user' | 'platform_admin' | 'system' | 'unknown';
export type ActivityGroupingRole = 'primary' | 'related';

export interface ActivityActorSnapshot {
  kind: Exclude<ActivityActorKind, 'unknown'>;
  displayName: string;
  role: string | null;
  subjectId?: string | null;
}

export interface ActivityMetadata {
  actorSnapshot: ActivityActorSnapshot | null;
  groupingRole: ActivityGroupingRole | null;
  legacyPlatformActorEmail: string | null;
}

export interface ActivityActor {
  kind: ActivityActorKind;
  displayName: string;
  role: string | null;
  actorId: string | null;
  subjectId: string | null;
}

export interface ActivityRenderInput {
  eventType: string;
  metadata: unknown;
}

export interface RenderedActivity {
  title: string;
  description: string;
  tone: EventTone;
  renderStatus: 'rendered' | 'fallback';
}

interface CurrentActor {
  fullName: string | null;
  email: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseActorSnapshot(value: unknown): ActivityActorSnapshot | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  const displayName = nonEmptyString(value.displayName);
  if ((kind !== 'tenant_user' && kind !== 'platform_admin' && kind !== 'system') || !displayName) {
    return null;
  }

  return {
    kind,
    displayName,
    role: nonEmptyString(value.role),
    subjectId: nonEmptyString(value.subjectId),
  };
}

/**
 * Decodes only the reserved activity fields. JSONB is untrusted historical
 * data, so malformed metadata is treated as absent rather than throwing.
 */
export function readActivityMetadata(metadata: unknown): ActivityMetadata {
  if (!isRecord(metadata)) {
    return { actorSnapshot: null, groupingRole: null, legacyPlatformActorEmail: null };
  }

  const grouping = isRecord(metadata.grouping) ? metadata.grouping : null;
  const role = grouping?.role;
  return {
    actorSnapshot: parseActorSnapshot(metadata.actorSnapshot),
    groupingRole: role === 'primary' || role === 'related' ? role : null,
    legacyPlatformActorEmail: nonEmptyString(metadata.platformActorEmail),
  };
}

export function resolveActivityActor(
  metadata: unknown,
  actorId: string | null,
  currentActor: CurrentActor,
): ActivityActor {
  const activity = readActivityMetadata(metadata);
  const snapshot = activity.actorSnapshot;
  if (snapshot) {
    return {
      kind: snapshot.kind,
      displayName:
        snapshot.kind === 'system' ? snapshot.displayName || 'System' : snapshot.displayName,
      role: snapshot.role,
      actorId,
      subjectId: snapshot.subjectId ?? actorId,
    };
  }

  if (activity.legacyPlatformActorEmail) {
    return {
      kind: 'platform_admin',
      displayName: activity.legacyPlatformActorEmail,
      role: 'Platform Admin',
      actorId,
      subjectId: null,
    };
  }

  if (actorId) {
    return {
      kind: 'tenant_user',
      displayName: currentActor.fullName || currentActor.email || 'Unknown actor',
      role: null,
      actorId,
      subjectId: actorId,
    };
  }

  return {
    kind: 'unknown',
    displayName: 'Unknown actor',
    role: null,
    actorId: null,
    subjectId: null,
  };
}

function humanizeEventType(eventType: string): string {
  const words = eventType
    .split('_')
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (words.length === 0) return 'Business event';
  return words.map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

export function renderActivityFallback(input: ActivityRenderInput): RenderedActivity {
  const rendered = renderEventActivity({
    eventType: input.eventType,
    metadata: isRecord(input.metadata) ? input.metadata : {},
  });
  return {
    title: rendered.title,
    description: rendered.description,
    tone: rendered.tone,
    renderStatus: rendered.renderStatus,
  };
}
import { renderEventActivity, type EventTone } from '@pump/core';
