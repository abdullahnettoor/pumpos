import {
  can,
  type OrganizationPayload,
  type OrganizationProfileMetadata,
  organizationUpdateSchema,
  type Role,
} from '@pump/shared';
import {
  BusinessEvents,
  coreError,
  ErrorCodes,
  err,
  eventFromContext,
  forbiddenError,
  ok,
  validationError,
} from '../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import {
  ORGANIZATION_PROFILE_KEYS,
  pickProfileMetadata,
  shapeOrganizationPayload,
  type OrganizationRecord,
} from './organization-payload.js';

/** The profile columns an Owner edits: the name and the stored metadata. */
export interface OrganizationProfileWrite {
  name: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

/** Reads and writes the Organization's own profile (#634). */
export interface OrganizationProfileRepository {
  findById(organizationId: string): Promise<OrganizationRecord | null>;
  updateProfile(
    organizationId: string,
    write: OrganizationProfileWrite,
  ): Promise<OrganizationRecord>;
}

export interface UpdateOrganizationDeps {
  repository: OrganizationProfileRepository;
  events: EventPublisher;
}

/** Raw request body; validated against `organizationUpdateSchema`. */
export type UpdateOrganizationCommand = unknown;

/** One field the update changed, in the event payload. */
export interface OrganizationFieldChange {
  from: string | null;
  to: string | null;
}

export type OrganizationProfileField = 'name' | (typeof ORGANIZATION_PROFILE_KEYS)[number];

export interface OrganizationUpdatedPayload {
  organizationId: string;
  name: string;
  changes: Partial<Record<OrganizationProfileField, OrganizationFieldChange>>;
}

const FIELD_LABELS: Record<OrganizationProfileField, string> = {
  name: 'name',
  legalName: 'legal name',
  gstin: 'GSTIN',
  pan: 'PAN',
  stateCode: 'state code',
  address: 'address',
  phone: 'phone',
  email: 'email',
};

/** The acting Owner's Role, or null when the actor may not edit the profile. */
function ownerRole(ctx: ExecutionContext): Role | null {
  const actor = ctx.actorSnapshot;
  if (!actor || actor.kind !== 'tenant_user' || actor.role === null) return null;
  const role = actor.role as Role;
  return can({ role }, 'organization.edit') ? role : null;
}

/** Profile keys as written: present keys are kept, omitted ones are cleared. */
function profileFrom(metadata: OrganizationProfileMetadata | null | undefined) {
  const profile: OrganizationProfileMetadata = {};
  if (!metadata) return profile;
  for (const key of ORGANIZATION_PROFILE_KEYS) {
    const value = metadata[key];
    if (value !== undefined) profile[key] = value;
  }
  return profile;
}

/** Stored metadata minus the profile keys: values written for other purposes. */
function nonProfileMetadata(metadata: unknown): Record<string, unknown> {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return {};
  const rest: Record<string, unknown> = { ...(metadata as Record<string, unknown>) };
  for (const key of ORGANIZATION_PROFILE_KEYS) delete rest[key];
  return rest;
}

function diff(
  existing: OrganizationRecord,
  name: string,
  profile: OrganizationProfileMetadata,
): OrganizationUpdatedPayload['changes'] {
  const changes: OrganizationUpdatedPayload['changes'] = {};
  if (existing.name !== name) changes.name = { from: existing.name, to: name };
  const before = pickProfileMetadata(existing.metadata);
  for (const key of ORGANIZATION_PROFILE_KEYS) {
    const from = before[key] ?? null;
    const to = profile[key] ?? null;
    if (from !== to) changes[key] = { from, to };
  }
  return changes;
}

/**
 * An Owner edits the Organization's name and profile metadata (#634).
 *
 * - Only an Owner acting as a tenant User may edit; everyone else is refused.
 * - The body is validated against `organizationUpdateSchema`, and only the
 *   profile keys are written. A metadata key stored for another purpose is
 *   kept, never wiped by a profile save.
 * - A real change and its ORGANIZATION_UPDATED event commit together (the
 *   caller wraps execution in one transaction). A save that changes nothing
 *   writes no row and emits no event.
 * - The result is the Organization shaped for the Owner, as GET returns it.
 */
export class UpdateOrganization implements UseCase<UpdateOrganizationCommand, OrganizationPayload> {
  constructor(private readonly deps: UpdateOrganizationDeps) {}

  async execute(
    input: UpdateOrganizationCommand,
    ctx: ExecutionContext,
  ): Promise<Result<OrganizationPayload>> {
    const role = ownerRole(ctx);
    if (!role) return err(forbiddenError('Only Owners can manage the organization'));

    const parsed = organizationUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return err(validationError(parsed.error.issues[0]?.message || 'Invalid input'));
    }

    const existing = await this.deps.repository.findById(ctx.organizationId);
    if (!existing) return err(coreError(ErrorCodes.NOT_FOUND, 'Organization not found'));

    const name = parsed.data.name;
    const profile = profileFrom(parsed.data.metadata);
    const changes = diff(existing, name, profile);
    if (Object.keys(changes).length === 0) return ok(shapeOrganizationPayload(existing, role));

    const updated = await this.deps.repository.updateProfile(ctx.organizationId, {
      name,
      metadata: { ...nonProfileMetadata(existing.metadata), ...profile },
      updatedAt: ctx.clock.now().toISOString(),
    });

    const fields = (Object.keys(changes) as OrganizationProfileField[]).map((f) => FIELD_LABELS[f]);
    await this.deps.events.publish([
      eventFromContext<typeof BusinessEvents.ORGANIZATION_UPDATED, OrganizationUpdatedPayload>(
        ctx,
        {
          eventType: BusinessEvents.ORGANIZATION_UPDATED,
          aggregateType: 'Organization',
          aggregateId: ctx.organizationId,
          payload: { organizationId: ctx.organizationId, name: updated.name, changes },
          presentation: {
            templateId: 'organization-updated.v1',
            values: { fields: fields.join(', ') },
          },
        },
      ),
    ]);

    return ok(shapeOrganizationPayload(updated, role));
  }
}
