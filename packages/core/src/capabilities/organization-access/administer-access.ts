import { BusinessEvents, err, eventFromContext, ok, validationError } from '../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import {
  isLimitKey,
  isProductCapabilityKey,
  PRODUCT_ACCESS_REGISTRY,
  type AccessRegistry,
} from './registry.js';
import type {
  AccessChangeResult,
  CapabilityGrant,
  LimitOverride,
  OrganizationAccessAdminRepository,
  PlatformActor,
} from './admin-ports.js';

/**
 * Platform administration of Organization access.
 *
 * Three rules hold across every command here:
 *  - Keys are validated against the code registry before anything is written,
 *    so configuration can never drift from deployed behaviour.
 *  - Commands are idempotent: a request that is already satisfied returns
 *    `changed: false`, writes no row and emits no event.
 *  - A real change and its business event commit together (the caller wraps
 *    execution in one transaction), so access never moves without its audit.
 */

export interface OrganizationAccessAdminDeps {
  repository: OrganizationAccessAdminRepository;
  events: EventPublisher;
  /** Override only in tests; production always uses the shipped registry. */
  registry?: AccessRegistry;
}

export interface GrantCapabilityCommand {
  capabilityKey: string;
  actor: PlatformActor;
  reason?: string | null;
}

/** Grant one exact Product Capability to one Organization. */
export class GrantOrganizationCapability implements UseCase<
  GrantCapabilityCommand,
  AccessChangeResult<CapabilityGrant>
> {
  constructor(private readonly deps: OrganizationAccessAdminDeps) {}

  async execute(
    input: GrantCapabilityCommand,
    ctx: ExecutionContext,
  ): Promise<Result<AccessChangeResult<CapabilityGrant>>> {
    const registry = this.deps.registry ?? PRODUCT_ACCESS_REGISTRY;
    const capabilityKey = input.capabilityKey.trim();
    if (!isProductCapabilityKey(capabilityKey, registry)) {
      return err(validationError(`Unknown Product Capability "${input.capabilityKey}"`));
    }

    const active = await this.deps.repository.findActiveGrant(ctx.organizationId, capabilityKey);
    if (active) return ok({ changed: false, record: active });

    const grant = await this.deps.repository.insertGrant({
      organizationId: ctx.organizationId,
      capabilityKey,
      actor: input.actor,
      reason: input.reason?.trim() || null,
    });

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.ORGANIZATION_CAPABILITY_GRANTED,
        aggregateType: 'Organization',
        aggregateId: ctx.organizationId,
        payload: {
          capabilityKey,
          grantId: grant.id,
          reason: grant.reason,
          platformActorEmail: input.actor.email,
        },
      }),
    ]);

    return ok({ changed: true, record: grant });
  }
}

export interface RevokeCapabilityCommand {
  capabilityKey: string;
  actor: PlatformActor;
  reason?: string | null;
}

/**
 * Close the active grant for one capability. Access returns to whatever the
 * Product Plan supplies; the closed row stays as history.
 */
export class RevokeOrganizationCapability implements UseCase<
  RevokeCapabilityCommand,
  AccessChangeResult<CapabilityGrant>
> {
  constructor(private readonly deps: OrganizationAccessAdminDeps) {}

  async execute(
    input: RevokeCapabilityCommand,
    ctx: ExecutionContext,
  ): Promise<Result<AccessChangeResult<CapabilityGrant>>> {
    const registry = this.deps.registry ?? PRODUCT_ACCESS_REGISTRY;
    const capabilityKey = input.capabilityKey.trim();
    if (!isProductCapabilityKey(capabilityKey, registry)) {
      return err(validationError(`Unknown Product Capability "${input.capabilityKey}"`));
    }

    const active = await this.deps.repository.findActiveGrant(ctx.organizationId, capabilityKey);
    if (!active) return ok({ changed: false, record: null });

    const revoked = await this.deps.repository.revokeGrant(active.id, input.actor);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.ORGANIZATION_CAPABILITY_REVOKED,
        aggregateType: 'Organization',
        aggregateId: ctx.organizationId,
        payload: {
          capabilityKey,
          grantId: revoked.id,
          reason: input.reason?.trim() || null,
          platformActorEmail: input.actor.email,
        },
      }),
    ]);

    return ok({ changed: true, record: revoked });
  }
}

export interface SetLimitOverrideCommand {
  limitKey: string;
  value: number;
  actor: PlatformActor;
  /** Required: support must be able to explain why the contract differs. */
  reason: string;
}

/**
 * Replace an Organization's Limit with a negotiated value. Changing an active
 * override closes the old row and inserts a new one in the same transaction —
 * the historical value is never edited in place.
 */
export class SetOrganizationLimitOverride implements UseCase<
  SetLimitOverrideCommand,
  AccessChangeResult<LimitOverride>
> {
  constructor(private readonly deps: OrganizationAccessAdminDeps) {}

  async execute(
    input: SetLimitOverrideCommand,
    ctx: ExecutionContext,
  ): Promise<Result<AccessChangeResult<LimitOverride>>> {
    const limitKey = input.limitKey.trim();
    if (!isLimitKey(limitKey)) {
      return err(validationError(`Unknown Limit "${input.limitKey}"`));
    }
    if (!Number.isInteger(input.value) || input.value < 1) {
      return err(validationError('Limit value must be a whole number greater than zero'));
    }
    const reason = input.reason?.trim();
    if (!reason) {
      return err(validationError('A reason is required for a manual Limit override'));
    }

    const active = await this.deps.repository.findActiveOverride(ctx.organizationId, limitKey);
    if (active && active.value === input.value) return ok({ changed: false, record: active });

    const previousValue = active?.value ?? null;
    if (active) await this.deps.repository.revokeOverride(active.id, input.actor);

    const override = await this.deps.repository.insertOverride({
      organizationId: ctx.organizationId,
      limitKey,
      value: input.value,
      actor: input.actor,
      reason,
    });

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.ORGANIZATION_LIMIT_OVERRIDE_SET,
        aggregateType: 'Organization',
        aggregateId: ctx.organizationId,
        payload: {
          limitKey,
          previousValue,
          value: override.value,
          reason,
          platformActorEmail: input.actor.email,
        },
      }),
    ]);

    return ok({ changed: true, record: override });
  }
}

export interface ClearLimitOverrideCommand {
  limitKey: string;
  actor: PlatformActor;
  reason?: string | null;
}

/** Drop the override so the Limit returns to the Product Plan value. */
export class ClearOrganizationLimitOverride implements UseCase<
  ClearLimitOverrideCommand,
  AccessChangeResult<LimitOverride>
> {
  constructor(private readonly deps: OrganizationAccessAdminDeps) {}

  async execute(
    input: ClearLimitOverrideCommand,
    ctx: ExecutionContext,
  ): Promise<Result<AccessChangeResult<LimitOverride>>> {
    const limitKey = input.limitKey.trim();
    if (!isLimitKey(limitKey)) {
      return err(validationError(`Unknown Limit "${input.limitKey}"`));
    }

    const active = await this.deps.repository.findActiveOverride(ctx.organizationId, limitKey);
    if (!active) return ok({ changed: false, record: null });

    const cleared = await this.deps.repository.revokeOverride(active.id, input.actor);

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.ORGANIZATION_LIMIT_OVERRIDE_CLEARED,
        aggregateType: 'Organization',
        aggregateId: ctx.organizationId,
        payload: {
          limitKey,
          previousValue: cleared.value,
          reason: input.reason?.trim() || null,
          platformActorEmail: input.actor.email,
        },
      }),
    ]);

    return ok({ changed: true, record: cleared });
  }
}
