import { z } from 'zod';
import type { Role } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

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
  setStationAssignments(userId: string, stationIds: string[]): Promise<void>;
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
  phone: z.string().max(50).nullish(),
  role: roleEnum.optional(),
  status: z.string().max(20).optional(),
  stationIds: z.array(z.string()).optional(),
  authUserId: z.string().nullish(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().trim().min(1).max(255).optional(),
  email: z.string().email().nullish().or(z.literal('')),
  phone: z.string().max(50).nullish(),
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
    if (!p.success) return err(validationError('Invalid CreateUser command', { issues: p.error.flatten() }));
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
      await this.deps.repository.setStationAssignments(user.id, p.data.stationIds);
    }
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.USER_CREATED,
        aggregateType: 'User',
        aggregateId: user.id,
        payload: { userId: user.id, role: user.role, email: user.email },
      }),
    ]);
    return ok(user);
  }
}

export class UpdateUser implements UseCase<UpdateUserCommand, User> {
  constructor(private readonly deps: UserDeps) {}
  async execute(input: UpdateUserCommand, ctx: ExecutionContext): Promise<Result<User>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateUser command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('User', p.data.id));
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
      await this.deps.repository.setStationAssignments(updated.id, p.data.stationIds);
    }
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.USER_UPDATED,
        aggregateType: 'User',
        aggregateId: updated.id,
        payload: { userId: updated.id },
      }),
    ]);
    return ok(updated);
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
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('User', input.id));
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
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('User', input.id));
    const updated: User = { ...existing, status: input.status, updatedAt: ctx.clock.now().toISOString() };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: input.status === 'INACTIVE' ? BusinessEvents.USER_DEACTIVATED : BusinessEvents.USER_REACTIVATED,
        aggregateType: 'User',
        aggregateId: updated.id,
        payload: { userId: updated.id, status: updated.status },
      }),
    ]);
    return ok(updated);
  }
}
