import type { ProductPlanKey, SubscriptionStatus } from '@pump/shared';
import { PAYMENT_GRACE_DAYS } from '@pump/shared';
import { BusinessEvents, err, eventFromContext, ok, validationError } from '../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Result, UseCase } from '../../kernel/index.js';
import type { AccessChangeResult, PlatformActor } from './admin-ports.js';
import type { OrganizationSubscriptionRepository } from './admin-ports.js';
import { paymentGraceUntil, resolveSubscriptionMode } from './resolve-access.js';
import { PRODUCT_ACCESS_REGISTRY, type AccessRegistry } from './registry.js';

/**
 * Provider-neutral subscription lifecycle.
 *
 * PumpOS moves an Organization between statuses; no payment provider is named
 * here, and nothing is scheduled. A Payment Grace Period is expressed as an
 * `access_until` instant and evaluated at request time, so the transition from
 * grace to Restricted happens by the clock rather than by a job that could
 * fail to run.
 */

const KNOWN_STATUSES: readonly SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'RESTRICTED',
  'CANCELED',
  'SUSPENDED',
];

export interface SubscriptionLifecycleDeps {
  subscriptions: OrganizationSubscriptionRepository;
  events: EventPublisher;
  /** Override only in tests; production always uses the shipped registry. */
  registry?: AccessRegistry;
}

export interface SetSubscriptionStatusCommand {
  status: string;
  /**
   * Paid-through instant. Omitted for PAST_DUE, the system supplies the
   * seven-day Payment Grace Period; omitted for any other status, the window
   * is cleared.
   */
  accessUntil?: string | null;
  actor: PlatformActor;
  reason?: string | null;
}

export interface SubscriptionChange {
  status: SubscriptionStatus;
  accessUntil: string | null;
  mode: ReturnType<typeof resolveSubscriptionMode>;
}

/**
 * Move an Organization to a Subscription Status.
 *
 * Idempotent: re-sending the state an Organization is already in writes
 * nothing and emits nothing, so a retried webhook or a double-clicked command
 * cannot fill the audit trail with non-events.
 */
export class SetOrganizationSubscriptionStatus implements UseCase<
  SetSubscriptionStatusCommand,
  AccessChangeResult<SubscriptionChange>
> {
  constructor(private readonly deps: SubscriptionLifecycleDeps) {}

  async execute(
    input: SetSubscriptionStatusCommand,
    ctx: ExecutionContext,
  ): Promise<Result<AccessChangeResult<SubscriptionChange>>> {
    const status = input.status?.trim().toUpperCase() as SubscriptionStatus;
    if (!KNOWN_STATUSES.includes(status)) {
      return err(validationError(`Unknown Subscription Status "${input.status}"`));
    }

    const current = await this.deps.subscriptions.load(ctx.organizationId);
    if (!current) return err(validationError('Organization not found'));

    const accessUntil = resolveAccessUntil(status, input.accessUntil, ctx);
    if (accessUntil instanceof Error) return err(validationError(accessUntil.message));

    if (current.status === status && (current.accessUntil ?? null) === accessUntil) {
      return ok({
        changed: false,
        record: {
          status,
          accessUntil,
          mode: resolveSubscriptionMode(status, { accessUntil, now: ctx.clock.now() }),
        },
      });
    }

    await this.deps.subscriptions.setStatus({
      organizationId: ctx.organizationId,
      status,
      accessUntil,
    });

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.ORGANIZATION_SUBSCRIPTION_STATUS_CHANGED,
        aggregateType: 'Organization',
        aggregateId: ctx.organizationId,
        payload: {
          previousStatus: current.status,
          status,
          previousAccessUntil: current.accessUntil ?? null,
          accessUntil,
          reason: input.reason?.trim() || null,
          platformActorEmail: input.actor.email,
        },
      }),
    ]);

    return ok({
      changed: true,
      record: {
        status,
        accessUntil,
        mode: resolveSubscriptionMode(status, { accessUntil, now: ctx.clock.now() }),
      },
    });
  }
}

/**
 * The paid-through instant a status implies.
 *
 * PAST_DUE without an explicit instant gets the standard grace window, so a
 * failed payment never silently restricts an Organization the same day.
 * Statuses that carry no window have it cleared, so a stale instant from an
 * earlier state cannot keep granting access.
 */
function resolveAccessUntil(
  status: SubscriptionStatus,
  supplied: string | null | undefined,
  ctx: ExecutionContext,
): string | null | Error {
  if (supplied === undefined) {
    return status === 'PAST_DUE' ? paymentGraceUntil(ctx.clock.now()) : null;
  }
  if (supplied === null) return null;
  const parsed = Date.parse(supplied);
  if (Number.isNaN(parsed)) return new Error(`Invalid access-until instant "${supplied}"`);
  return new Date(parsed).toISOString();
}

export interface ConfirmPaymentCommand {
  actor: PlatformActor;
  reason?: string | null;
}

/**
 * Payment confirmed: back to ACTIVE immediately, with the grace window
 * cleared.
 *
 * Immediacy is the point — an Organization that has paid must not wait for a
 * job to notice. Confirming payment for an already-ACTIVE Organization is a
 * no-op, so a duplicated provider callback is harmless.
 */
export class ConfirmOrganizationPayment implements UseCase<
  ConfirmPaymentCommand,
  AccessChangeResult<SubscriptionChange>
> {
  constructor(private readonly deps: SubscriptionLifecycleDeps) {}

  execute(
    input: ConfirmPaymentCommand,
    ctx: ExecutionContext,
  ): Promise<Result<AccessChangeResult<SubscriptionChange>>> {
    return new SetOrganizationSubscriptionStatus(this.deps).execute(
      {
        status: 'ACTIVE',
        accessUntil: null,
        actor: input.actor,
        reason: input.reason?.trim() || 'payment confirmed',
      },
      ctx,
    );
  }
}

export interface SetPlanCommand {
  plan: string;
  actor: PlatformActor;
  reason?: string | null;
}

/**
 * Assign a Product Plan. Plan keys are code-defined, so an unknown key is
 * rejected before anything is written — configuration cannot name a package
 * this build does not implement.
 */
export class SetOrganizationPlan implements UseCase<
  SetPlanCommand,
  AccessChangeResult<{ plan: ProductPlanKey }>
> {
  constructor(private readonly deps: SubscriptionLifecycleDeps) {}

  async execute(
    input: SetPlanCommand,
    ctx: ExecutionContext,
  ): Promise<Result<AccessChangeResult<{ plan: ProductPlanKey }>>> {
    const registry = this.deps.registry ?? PRODUCT_ACCESS_REGISTRY;
    const plan = input.plan?.trim().toUpperCase() as ProductPlanKey;
    if (!Object.prototype.hasOwnProperty.call(registry.plans, plan)) {
      return err(validationError(`Unknown Product Plan "${input.plan}"`));
    }

    const current = await this.deps.subscriptions.load(ctx.organizationId);
    if (!current) return err(validationError('Organization not found'));
    if (current.plan === plan) return ok({ changed: false, record: { plan } });

    await this.deps.subscriptions.setPlan({ organizationId: ctx.organizationId, plan });

    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.ORGANIZATION_PLAN_CHANGED,
        aggregateType: 'Organization',
        aggregateId: ctx.organizationId,
        payload: {
          previousPlan: current.plan,
          plan,
          reason: input.reason?.trim() || null,
          platformActorEmail: input.actor.email,
        },
      }),
    ]);

    return ok({ changed: true, record: { plan } });
  }
}

/** Re-exported so callers do not have to reach into `@pump/shared` for it. */
export { PAYMENT_GRACE_DAYS };
