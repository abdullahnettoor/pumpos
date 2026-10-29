import { z } from 'zod';
import type { Role } from '@pump/shared';
import {
  hasFixedPermissions,
  normalizeIndianMobile,
  optionalIndianMobileSchema,
  phoneToAuthEmail,
  resolveEffectivePermissions,
} from '@pump/shared';
import { ensureLoginCapacity } from '../../organization-access/login-capacity.js';
import type { LoginCapacityPort } from '../../organization-access/login-capacity.js';
import type { UserPermissionChangesWriter } from '../../organization-access/ports.js';
import { userPermissionsChangedEvent } from '../../organization-access/user-permissions.js';
import {
  BusinessEvents,
  conflictError,
  err,
  eventFromContext,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type {
  DomainEvent,
  EventPublisher,
  ExecutionContext,
  Repository,
  Result,
  UseCase,
} from '../../../kernel/index.js';

export interface User {
  id: string;
  organizationId: string;
  authUserId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithAssignments extends User {
  stationIds: string[];
}

export interface UserRepository extends Repository<User> {
  save(user: User): Promise<void>;
  /** Link a member to its login account. `save` never writes `authUserId`. */
  linkLogin(userId: string, authUserId: string): Promise<void>;
  /** Replace the user's station assignments; every station must belong to the organization. */
  setStationAssignments(
    userId: string,
    stationIds: string[],
    organizationId: string,
  ): Promise<void>;
  listWithAssignments(organizationId: string): Promise<UserWithAssignments[]>;
}

export interface CreateUserCommand {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  role?: Role;
  status?: string;
  stationIds?: string[];
  /** Set when a login account was provisioned server-side (Supabase admin). */
  authUserId?: string | null;
}

export interface UpdateUserCommand {
  id: string;
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  role?: Role;
  status?: string;
  stationIds?: string[];
}

const roleEnum = z.enum(['Owner', 'Manager', 'Accountant', 'Staff', 'Attendant']);
const createSchema = z.object({
  fullName: z.string().trim().min(1, 'fullName is required').max(255),
  email: z.string().email().nullish().or(z.literal('')),
  phone: optionalIndianMobileSchema,
  role: roleEnum.optional(),
  status: z.string().max(20).optional(),
  stationIds: z.array(z.string()).optional(),
  authUserId: z.string().nullish(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().trim().min(1).max(255).optional(),
  email: z.string().email().nullish().or(z.literal('')),
  phone: optionalIndianMobileSchema.optional(),
  role: roleEnum.optional(),
  status: z.string().max(20).optional(),
  stationIds: z.array(z.string()).optional(),
});

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export interface UserDeps {
  repository: UserRepository;
  events: EventPublisher;
}

export class CreateUser implements UseCase<CreateUserCommand, User> {
  constructor(private readonly deps: UserDeps) {}
  async execute(input: CreateUserCommand, ctx: ExecutionContext): Promise<Result<User>> {
    const p = createSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid CreateUser command', { issues: p.error.flatten() }));
    const now = ctx.clock.now().toISOString();
    const user: User = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      authUserId: p.data.authUserId ?? null,
      fullName: p.data.fullName,
      email: normalizeEmail(p.data.email),
      phone: p.data.phone ?? null,
      role: p.data.role ?? 'Staff',
      status: p.data.status ?? 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save(user);
    if (p.data.stationIds && p.data.stationIds.length > 0) {
      await this.deps.repository.setStationAssignments(
        user.id,
        p.data.stationIds,
        ctx.organizationId,
      );
    }
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.USER_CREATED,
        aggregateType: 'User',
        aggregateId: user.id,
        payload: { userId: user.id, role: user.role, email: user.email },
      }),
      // A login account was provisioned server-side (email or phone handle) —
      // a distinct audit signal from a record-only user (authUserId NULL).
      ...(user.authUserId
        ? [
            eventFromContext(ctx, {
              eventType: BusinessEvents.USER_INVITED,
              aggregateType: 'User',
              aggregateId: user.id,
              payload: {
                userId: user.id,
                role: user.role,
                hasPhone: !!user.phone,
                hasEmail: !!user.email,
              },
            }),
          ]
        : []),
    ]);
    return ok(user);
  }
}

export interface UpdateUserDeps extends UserDeps {
  /** When present, a Role change resets the member's stored Permission changes. */
  permissionChanges?: UserPermissionChangesWriter;
}

/** The updated user, plus any Permission changes a Role change reset. */
export type UpdatedUser = User & {
  droppedPermissionChanges: { granted: string[]; revoked: string[] } | null;
};

export class UpdateUser implements UseCase<UpdateUserCommand, UpdatedUser> {
  constructor(private readonly deps: UpdateUserDeps) {}
  async execute(input: UpdateUserCommand, ctx: ExecutionContext): Promise<Result<UpdatedUser>> {
    const p = updateSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid UpdateUser command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId)
      return err(notFoundError('User', p.data.id));
    const updated: User = {
      ...existing,
      fullName: p.data.fullName ?? existing.fullName,
      email: p.data.email !== undefined ? normalizeEmail(p.data.email) : existing.email,
      phone: p.data.phone !== undefined ? p.data.phone : existing.phone,
      role: p.data.role ?? existing.role,
      status: p.data.status ?? existing.status,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    if (p.data.stationIds !== undefined) {
      await this.deps.repository.setStationAssignments(
        updated.id,
        p.data.stationIds,
        ctx.organizationId,
      );
    }
    const events: DomainEvent[] = [
      eventFromContext(ctx, {
        eventType: BusinessEvents.USER_UPDATED,
        aggregateType: 'User',
        aggregateId: updated.id,
        payload: { userId: updated.id },
      }),
    ];
    let dropped: UpdatedUser['droppedPermissionChanges'] = null;
    const store = this.deps.permissionChanges;
    if (store && updated.role !== existing.role) {
      const stored = await store.load(ctx.organizationId, updated.id);
      const before = {
        granted: [...(stored?.granted ?? [])].sort(),
        revoked: [...(stored?.revoked ?? [])].sort(),
      };
      if (before.granted.length > 0 || before.revoked.length > 0) {
        await store.clear(ctx.organizationId, updated.id);
        dropped = before;
        const effective = (role: string, changes: typeof before | null) =>
          [
            ...resolveEffectivePermissions({
              role,
              changes,
              entitled: !hasFixedPermissions(role),
            }),
          ].sort();
        events.push(
          userPermissionsChangedEvent(
            ctx,
            updated,
            {
              userId: updated.id,
              reason: 'ROLE_CHANGED',
              fromRole: existing.role,
              toRole: updated.role,
              before: { changes: before, effective: effective(existing.role, before) },
              after: {
                changes: { granted: [], revoked: [] },
                effective: effective(updated.role, null),
              },
            },
            'related',
          ),
        );
      }
    }
    await this.deps.events.publish(events);
    return ok({ ...updated, droppedPermissionChanges: dropped });
  }
}

export interface ResetUserPasswordCommand {
  id: string;
}

/**
 * Audit-only use-case: the actual password change happens server-side against
 * Supabase (admin API) in the route; this loads + validates tenancy and emits
 * the audit event. Returns the user so the route has its `authUserId`.
 */
export class ResetUserPassword implements UseCase<ResetUserPasswordCommand, User> {
  constructor(private readonly deps: UserDeps) {}
  async execute(input: ResetUserPasswordCommand, ctx: ExecutionContext): Promise<Result<User>> {
    const existing = await this.deps.repository.findById(input.id);
    if (!existing || existing.organizationId !== ctx.organizationId)
      return err(notFoundError('User', input.id));
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.USER_PASSWORD_RESET,
        aggregateType: 'User',
        aggregateId: existing.id,
        payload: { userId: existing.id },
      }),
    ]);
    return ok(existing);
  }
}

export interface SetUserStatusCommand {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
}

/** Deactivate/reactivate a user (status flip + audit event). The auth-account
 *  ban/unban is handled in the route via the Supabase admin API. */
export class SetUserStatus implements UseCase<SetUserStatusCommand, User> {
  constructor(private readonly deps: UserDeps) {}
  async execute(input: SetUserStatusCommand, ctx: ExecutionContext): Promise<Result<User>> {
    const existing = await this.deps.repository.findById(input.id);
    if (!existing || existing.organizationId !== ctx.organizationId)
      return err(notFoundError('User', input.id));
    const updated: User = {
      ...existing,
      status: input.status,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType:
          input.status === 'INACTIVE'
            ? BusinessEvents.USER_DEACTIVATED
            : BusinessEvents.USER_REACTIVATED,
        aggregateType: 'User',
        aggregateId: updated.id,
        payload: { userId: updated.id, status: updated.status },
      }),
    ]);
    return ok(updated);
  }
}

/** The login-account provider (Supabase Auth admin), behind a port so core stays framework-free. */
export interface LoginProvisioner {
  /**
   * Create a confirmed login for `email` (a real address or the phone handle).
   * A taken identity is a CONFLICT with `details.reason = 'IDENTITY_TAKEN'`.
   */
  createLogin(input: { email: string; password: string }): Promise<Result<{ authUserId: string }>>;
}

export interface GrantUserAppAccessCommand {
  id: string;
  email?: string | null;
  phone?: string | null;
  password: string;
}

const grantAppAccessSchema = z
  .object({
    id: z.string().min(1),
    email: z.string().trim().email().nullish().or(z.literal('')),
    phone: optionalIndianMobileSchema,
    password: z.string().min(8, 'Password must be at least 8 characters'),
  })
  .superRefine((val, ctx) => {
    const identities = [val.email, val.phone].filter((v) => !!v && v.trim() !== '').length;
    if (identities !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'Give exactly one of email or phone for app access',
      });
    }
  });

export interface GrantUserAppAccessDeps extends UserDeps {
  capacity: LoginCapacityPort;
  logins: LoginProvisioner;
}

/**
 * Give an existing member without a login an app login (#462). Mirrors
 * creating a member with app access: a login takes a `login_count` seat
 * (ACTIVE members only; reactivating an INACTIVE one takes it later), decided
 * under the Organization lock on a re-read of the member. The password only
 * ever reaches the provisioner; it is never stored, logged or put on an event.
 */
export class GrantUserAppAccess implements UseCase<GrantUserAppAccessCommand, User> {
  constructor(private readonly deps: GrantUserAppAccessDeps) {}
  async execute(input: GrantUserAppAccessCommand, ctx: ExecutionContext): Promise<Result<User>> {
    const p = grantAppAccessSchema.safeParse(input);
    if (!p.success)
      return err(
        validationError('Invalid GrantUserAppAccess command', { issues: p.error.flatten() }),
      );
    const email = normalizeEmail(p.data.email);
    const phone = normalizeIndianMobile(p.data.phone);
    const loginHandle = email ?? phoneToAuthEmail(phone);
    if (!loginHandle) return err(validationError('A valid email or phone is required'));

    await this.deps.capacity.lockOrganization(ctx.organizationId);
    const target = await this.deps.repository.findById(p.data.id);
    if (!target || target.organizationId !== ctx.organizationId)
      return err(notFoundError('User', p.data.id));
    if (target.authUserId !== null)
      return err(
        conflictError('This member already has app access', { reason: 'ALREADY_HAS_LOGIN' }),
      );
    if (target.status === 'ACTIVE') {
      const capacity = await ensureLoginCapacity(this.deps.capacity, ctx.organizationId);
      if (!capacity.success) return capacity;
    }

    const created = await this.deps.logins.createLogin({
      email: loginHandle,
      password: p.data.password,
    });
    if (!created.success) return created;
    const { authUserId } = created.data;

    const updated: User = {
      ...target,
      authUserId,
      // The login identity is the member's contact of that kind.
      email: email ?? target.email,
      phone: phone ?? target.phone,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    await this.deps.repository.linkLogin(updated.id, authUserId);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.USER_APP_ACCESS_GRANTED,
        aggregateType: 'User',
        aggregateId: updated.id,
        payload: {
          userId: updated.id,
          role: updated.role,
          hasPhone: !!phone,
          hasEmail: !!email,
        },
      }),
    ]);
    return ok(updated);
  }
}
