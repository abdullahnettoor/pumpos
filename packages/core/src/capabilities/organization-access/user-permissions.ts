import { z } from 'zod';
import {
  CUSTOM_PERMISSIONS_CAPABILITY,
  PERMISSIONS,
  canEditMemberPermissions,
  defaultPermissionsFor,
  hasFixedPermissions,
  normalizePermissionChanges,
  resolveEffectivePermissions,
  samePermissionChanges,
  type PermissionChangeProblem,
  type PermissionChanges,
  type PermissionId,
  type RoleChangePreview,
  type UserPermissionsView,
  type Role,
} from '@pump/shared';
import {
  BusinessEvents,
  err,
  eventFromContext,
  forbiddenError,
  notFoundError,
  ok,
  validationError,
} from '../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import type {
  OrganizationAccessReader,
  StoredPermissionChanges,
  UserPermissionChangesReader,
  UserPermissionChangesWriter,
} from './ports.js';
import { resolveEffectiveCapabilities } from './resolve-access.js';
import type { AccessRegistry } from './registry.js';

/** The slice of a team member these use-cases need; `UserRepository` satisfies it. */
export interface PermissionTargetReader {
  findById(
    id: string,
  ): Promise<{ id: string; organizationId: string; role: string; fullName: string } | null>;
}

const idList = z.array(z.string().min(1).max(100)).max(200).optional();
const setSchema = z.object({
  userId: z.string().min(1),
  granted: idList,
  revoked: idList,
});

const sortedIds = (ids: Iterable<PermissionId>) => [...ids].sort();
const clean = (c: PermissionChanges | null | undefined): StoredPermissionChanges => ({
  granted: [...(c?.granted ?? [])].sort(),
  revoked: [...(c?.revoked ?? [])].sort(),
});
const isEmpty = (c: StoredPermissionChanges) => c.granted.length === 0 && c.revoked.length === 0;

function ownerOnly(ctx: ExecutionContext) {
  const actor = ctx.actorSnapshot;
  const role = actor && actor.kind === 'tenant_user' ? actor.role : null;
  return canEditMemberPermissions(role)
    ? null
    : forbiddenError("Only Owners can change a team member's permissions");
}

export interface UserPermissionsDeps {
  users: PermissionTargetReader;
  changes: UserPermissionChangesReader;
  access: OrganizationAccessReader;
  registry?: AccessRegistry;
}

async function isEntitled(deps: UserPermissionsDeps, organizationId: string): Promise<boolean> {
  const inputs = await deps.access.load(organizationId);
  return resolveEffectiveCapabilities(inputs, deps.registry).has(CUSTOM_PERMISSIONS_CAPABILITY);
}

function view(
  user: { id: string; role: string },
  entitled: boolean,
  stored: StoredPermissionChanges,
): UserPermissionsView {
  const fixed = hasFixedPermissions(user.role);
  return {
    userId: user.id,
    role: user.role,
    editable: !fixed,
    readOnlyReason: !fixed ? null : user.role === 'Owner' ? 'OWNER' : 'ATTENDANT',
    entitled,
    defaults: sortedIds(defaultPermissionsFor(user.role as Role)),
    changes: stored,
    effective: sortedIds(
      resolveEffectivePermissions({ role: user.role, changes: stored, entitled }),
    ),
  };
}

/** The Owner reads a member's Default Permissions, stored changes and effective set. */
export class GetUserPermissions implements UseCase<{ userId: string }, UserPermissionsView> {
  constructor(private readonly deps: UserPermissionsDeps) {}

  async execute(
    input: { userId: string },
    ctx: ExecutionContext,
  ): Promise<Result<UserPermissionsView>> {
    const denied = ownerOnly(ctx);
    if (denied) return err(denied);
    const user = await this.deps.users.findById(input.userId);
    if (!user || user.organizationId !== ctx.organizationId) {
      return err(notFoundError('User', input.userId));
    }
    const stored = clean(await this.deps.changes.load(ctx.organizationId, user.id));
    const entitled = await isEntitled(this.deps, ctx.organizationId);
    return ok(view(user, entitled, stored));
  }
}

export interface SetUserPermissionsDeps extends Omit<UserPermissionsDeps, 'changes'> {
  changes: UserPermissionChangesWriter;
  events: EventPublisher;
}

/** The payload shared by every USER_PERMISSIONS_CHANGED event. */
export interface UserPermissionsChangedPayload {
  userId: string;
  reason: 'EDITED' | 'ROLE_CHANGED';
  fromRole: string;
  toRole: string;
  before: { changes: StoredPermissionChanges; effective: PermissionId[] };
  after: { changes: StoredPermissionChanges; effective: PermissionId[] };
}

const label = (id: string) => (PERMISSIONS as Record<string, { label: string }>)[id]?.label ?? id;

function summarize(before: StoredPermissionChanges, after: StoredPermissionChanges): string {
  const parts: string[] = [];
  if (after.granted.length) parts.push(`granted ${after.granted.map(label).join(', ')}`);
  if (after.revoked.length) parts.push(`revoked ${after.revoked.map(label).join(', ')}`);
  return parts.length
    ? parts.join('; ')
    : `reset to Role defaults (${before.granted.length + before.revoked.length} dropped)`;
}

/** Builds the audit event; also used by the Role-change reset in `UpdateUser`. */
export function userPermissionsChangedEvent(
  ctx: ExecutionContext,
  member: { id: string; fullName: string },
  payload: UserPermissionsChangedPayload,
  groupingRole?: 'primary' | 'related',
) {
  return eventFromContext<
    typeof BusinessEvents.USER_PERMISSIONS_CHANGED,
    UserPermissionsChangedPayload
  >(ctx, {
    eventType: BusinessEvents.USER_PERMISSIONS_CHANGED,
    aggregateType: 'User',
    aggregateId: member.id,
    payload,
    groupingRole,
    presentation: {
      templateId: 'user-permissions-changed.v1',
      values: {
        member: member.fullName,
        summary:
          payload.reason === 'ROLE_CHANGED'
            ? `Role changed to ${payload.toRole}; custom changes dropped`
            : summarize(payload.before.changes, payload.after.changes),
      },
    },
  });
}

function problemMessage(p: PermissionChangeProblem): string {
  switch (p.code) {
    case 'UNKNOWN_PERMISSION':
      return `Unknown permission "${p.permission}"`;
    case 'NEVER_DELEGABLE':
      return `"${label(p.permission)}" cannot be given to another member`;
    case 'CONFLICTING_CHANGE':
      return `"${label(p.permission)}" is both granted and revoked`;
  }
}

/**
 * The Owner replaces a member's Permission changes (ADR 0013).
 *
 * - Owner only. The Owner's and Attendants' Permissions are fixed, so they
 *   are refused. Never-delegable grants are refused.
 * - The request is normalised: prerequisites of a grant are added, dependants
 *   of a revoke are dropped, and only differences from the Role defaults are
 *   stored. No difference removes the row.
 * - A real change and its USER_PERMISSIONS_CHANGED event commit together. A
 *   request that changes nothing writes nothing and emits nothing.
 * - Entitlement ("Custom permissions") is enforced by the route's capability
 *   guard, so the Restricted-Access and capability refusals precede this.
 */
export class SetUserPermissions implements UseCase<
  { userId: string; granted?: string[]; revoked?: string[] },
  UserPermissionsView
> {
  constructor(private readonly deps: SetUserPermissionsDeps) {}

  async execute(
    input: { userId: string; granted?: string[]; revoked?: string[] },
    ctx: ExecutionContext,
  ): Promise<Result<UserPermissionsView>> {
    const denied = ownerOnly(ctx);
    if (denied) return err(denied);
    const parsed = setSchema.safeParse(input);
    if (!parsed.success) {
      return err(validationError(parsed.error.issues[0]?.message || 'Invalid input'));
    }
    const user = await this.deps.users.findById(parsed.data.userId);
    if (!user || user.organizationId !== ctx.organizationId) {
      return err(notFoundError('User', parsed.data.userId));
    }
    if (hasFixedPermissions(user.role)) {
      return err(
        forbiddenError(
          user.role === 'Owner'
            ? "The Owner's permissions cannot be changed"
            : "An Attendant's permissions cannot be changed",
        ),
      );
    }

    const normalized = normalizePermissionChanges(user.role as Role, parsed.data);
    if (!normalized.ok) {
      return err(
        validationError(problemMessage(normalized.problems[0]), { problems: normalized.problems }),
      );
    }

    const before = clean(await this.deps.changes.load(ctx.organizationId, user.id));
    const after = clean(normalized.value.changes);
    const entitled = await isEntitled(this.deps, ctx.organizationId);

    if (!samePermissionChanges(before, after)) {
      const beforeEffective = sortedIds(
        resolveEffectivePermissions({ role: user.role, changes: before, entitled: true }),
      );
      if (isEmpty(after)) {
        await this.deps.changes.clear(ctx.organizationId, user.id);
      } else {
        await this.deps.changes.save({
          id: ctx.ids.newId(),
          organizationId: ctx.organizationId,
          userId: user.id,
          changes: after,
          updatedByUserId: ctx.actorId,
          at: ctx.clock.now().toISOString(),
        });
      }
      await this.deps.events.publish([
        userPermissionsChangedEvent(ctx, user, {
          userId: user.id,
          reason: 'EDITED',
          fromRole: user.role,
          toRole: user.role,
          before: { changes: before, effective: beforeEffective },
          after: { changes: after, effective: normalized.value.effective },
        }),
      ]);
    }
    return ok(view(user, entitled, after));
  }
}

export class PreviewUserRoleChange implements UseCase<
  { userId: string; role: string },
  RoleChangePreview
> {
  constructor(
    private readonly deps: { users: PermissionTargetReader; changes: UserPermissionChangesReader },
  ) {}

  async execute(
    input: { userId: string; role: string },
    ctx: ExecutionContext,
  ): Promise<Result<RoleChangePreview>> {
    const user = await this.deps.users.findById(input.userId);
    if (!user || user.organizationId !== ctx.organizationId) {
      return err(notFoundError('User', input.userId));
    }
    const stored =
      input.role === user.role
        ? null
        : clean(await this.deps.changes.load(ctx.organizationId, user.id));
    return ok({
      userId: user.id,
      fromRole: user.role,
      toRole: input.role,
      droppedChanges: stored && !isEmpty(stored) ? stored : null,
    });
  }
}
