import { z } from 'zod';
import {
  can,
  TANK_LEVEL_SETTINGS_KEY,
  tankLevelsChanged,
  tankLevelSettingsSchema,
  tankRulesSettingsSchema,
  resolveTankLevelSettings,
  type TankRulesSettings,
  STOCK_VARIANCE_TOLERANCE_KEY,
  stockVarianceToleranceChanged,
  stockVarianceTolerancePctSchema,
  resolveStockVarianceTolerance,
} from '@pump/shared';
import {
  actorPrincipal,
  BusinessEvents,
  err,
  eventFromContext,
  forbiddenError,
  notFoundError,
  ok,
  validationError,
} from '../../../kernel/index.js';
import type {
  EventPublisher,
  ExecutionContext,
  TenantRepository,
  Result,
  UseCase,
} from '../../../kernel/index.js';
import {
  ensureStationCapacity,
  type StationCapacityPort,
} from '../../organization-access/station-capacity.js';

export interface Station {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  settings: Record<string, unknown>;
  onboardingStatus: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StationRepository extends TenantRepository<Station> {
  lockForUpdate(id: string, organizationId: string): Promise<Station | null>;
  listByOrganization(organizationId: string): Promise<Station[]>;
}

/**
 * Narrow write port for the tank rules (#690): merges only the given keys into
 * the stored settings in one statement, so no other key is read back or
 * rewritten. Null when the Station is not in the Organization.
 */
export interface StationSettingsPatchRepository {
  /**
   * Reads the Station for update: scoped to the Organization and row-locked
   * until the transaction ends, so concurrent saves queue and each sees the
   * last one's result. Null when the Station is not in the Organization.
   */
  lockForUpdate(id: string, organizationId: string): Promise<Station | null>;
  patchSettings(
    id: string,
    organizationId: string,
    patch: Record<string, unknown>,
    updatedAt: string,
  ): Promise<Station | null>;
}

export interface CreateStationCommand {
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  settings?: Record<string, unknown>;
  onboardingStatus?: string;
  isActive?: boolean;
}

export interface UpdateStationCommand {
  id: string;
  name?: string;
  code?: string;
  address?: string | null;
  phone?: string | null;
  settings?: Record<string, unknown>;
  onboardingStatus?: string;
  isActive?: boolean;
}

export const DEFAULT_STATION_SETTINGS: Record<string, unknown> = {
  shift_grace_minutes: 15,
  shift_lock_grace_days: 3,
  offline_warning_days: 3,
  offline_critical_days: 7,
};

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(255),
  code: z.string().trim().min(1, 'code is required').max(50),
  address: z.string().max(500).nullish(),
  phone: z.string().max(50).nullish(),
  settings: z.record(z.any()).optional(),
  onboardingStatus: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(255).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  address: z.string().max(500).nullish(),
  phone: z.string().max(50).nullish(),
  settings: z.record(z.any()).optional(),
  onboardingStatus: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Tank-level thresholds (#520) colour every tank on every screen, so changing
 * them is narrower than editing the Station: `station.tankLevels`. Enforced
 * here so every caller is covered. A command with no tenant-user actor (a
 * system job) is not a user acting.
 */
function mayChangeTankLevels(ctx: ExecutionContext): boolean {
  const actor = ctx.actorSnapshot;
  if (!actor || actor.kind !== 'tenant_user') return true;
  const principal = actorPrincipal(ctx);
  return principal !== null && can(principal, 'station.tankLevels');
}

/** Refusal for a settings write that changes the tank-level thresholds; null when allowed. */
function tankLevelsChangeError(
  existing: Record<string, unknown>,
  next: Record<string, unknown> | undefined,
  ctx: ExecutionContext,
) {
  if (!next) return null;
  const before = existing[TANK_LEVEL_SETTINGS_KEY];
  const after = next[TANK_LEVEL_SETTINGS_KEY];
  if (!tankLevelsChanged(before, after)) return null;
  if (!mayChangeTankLevels(ctx))
    return forbiddenError('Only an Owner or Manager can change tank levels');
  if (after !== undefined && !tankLevelSettingsSchema.safeParse(after).success)
    return validationError('Tank levels need 0 < critical < low ≤ 100');
  return null;
}

function stockVarianceToleranceChangeError(
  existing: Record<string, unknown>,
  next: Record<string, unknown> | undefined,
  ctx: ExecutionContext,
) {
  if (!next || !(STOCK_VARIANCE_TOLERANCE_KEY in next)) return null;
  const after = next[STOCK_VARIANCE_TOLERANCE_KEY];
  if (!stockVarianceToleranceChanged(existing[STOCK_VARIANCE_TOLERANCE_KEY], after)) return null;
  if (!mayChangeTankLevels(ctx))
    return forbiddenError('Only an Owner or Manager can change the tank variance limit');
  if (!stockVarianceTolerancePctSchema.safeParse(after).success)
    return validationError('Tank variance limit must be 0 to 5, up to 2 decimals');
  return null;
}

export interface StationDeps {
  repository: StationRepository;
  events: EventPublisher;
}

export interface CreateStationDeps extends StationDeps {
  /**
   * Station capacity guard. Required, like the onboarding one: every path that
   * creates a Station row must consume `station_count`, or the Limit is
   * bypassable by picking the other endpoint.
   */
  capacity: StationCapacityPort;
}

export class CreateStation implements UseCase<CreateStationCommand, Station> {
  constructor(private readonly deps: CreateStationDeps) {}
  async execute(input: CreateStationCommand, ctx: ExecutionContext): Promise<Result<Station>> {
    const p = createSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid CreateStation command', { issues: p.error.flatten() }));

    const capacity = await ensureStationCapacity(this.deps.capacity, ctx.organizationId);
    if (!capacity.success) return capacity;

    const now = ctx.clock.now().toISOString();
    const station: Station = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      name: p.data.name,
      code: p.data.code,
      address: p.data.address ?? null,
      phone: p.data.phone ?? null,
      settings: p.data.settings ?? { ...DEFAULT_STATION_SETTINGS },
      onboardingStatus: p.data.onboardingStatus ?? 'NOT_STARTED',
      isActive: p.data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save(station);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.STATION_CREATED,
        aggregateType: 'Station',
        aggregateId: station.id,
        stationId: station.id,
        payload: { stationId: station.id, code: station.code, name: station.name },
      }),
    ]);
    return ok(station);
  }
}

export class UpdateStation implements UseCase<UpdateStationCommand, Station> {
  constructor(private readonly deps: StationDeps) {}
  async execute(input: UpdateStationCommand, ctx: ExecutionContext): Promise<Result<Station>> {
    const p = updateSchema.safeParse(input);
    if (!p.success)
      return err(validationError('Invalid UpdateStation command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.lockForUpdate(p.data.id, ctx.organizationId);
    if (!existing || existing.organizationId !== ctx.organizationId)
      return err(notFoundError('Station', p.data.id));
    const settings = { ...existing.settings, ...p.data.settings };
    const tankLevelsError = tankLevelsChangeError(existing.settings ?? {}, p.data.settings, ctx);
    if (tankLevelsError) return err(tankLevelsError);
    const varianceError = stockVarianceToleranceChangeError(
      existing.settings ?? {},
      p.data.settings,
      ctx,
    );
    if (varianceError) return err(varianceError);
    const varianceChanged =
      p.data.settings !== undefined &&
      STOCK_VARIANCE_TOLERANCE_KEY in p.data.settings &&
      stockVarianceToleranceChanged(
        existing.settings[STOCK_VARIANCE_TOLERANCE_KEY],
        p.data.settings[STOCK_VARIANCE_TOLERANCE_KEY],
      );
    const updated: Station = {
      ...existing,
      name: p.data.name ?? existing.name,
      code: p.data.code ?? existing.code,
      address: p.data.address !== undefined ? p.data.address : existing.address,
      phone: p.data.phone !== undefined ? p.data.phone : existing.phone,
      settings,
      onboardingStatus: p.data.onboardingStatus ?? existing.onboardingStatus,
      isActive: p.data.isActive ?? existing.isActive,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.STATION_UPDATED,
        aggregateType: 'Station',
        aggregateId: updated.id,
        stationId: updated.id,
        payload: {
          stationId: updated.id,
          ...(varianceChanged
            ? {
                stockVarianceTolerancePct: {
                  before: resolveStockVarianceTolerance(existing.settings),
                  after: resolveStockVarianceTolerance(updated.settings),
                },
              }
            : {}),
        },
      }),
    ]);
    return ok(updated);
  }
}

export interface UpdateStationTankRulesCommand {
  id: string;
  /** Only `tankLevels` and `stock_variance_tolerance_pct`; anything else is refused. */
  settings: TankRulesSettings;
}

export interface UpdateStationTankRulesDeps {
  repository: StationSettingsPatchRepository;
  events: EventPublisher;
}

/**
 * Saves the tank-level thresholds and tank variance limit under
 * `station.tankLevels` alone (#690), so a user holding it needs no
 * `station.manage`. Writes only the submitted keys; the caller's Station
 * assignment is checked at the route.
 */
export class UpdateStationTankRules implements UseCase<UpdateStationTankRulesCommand, Station> {
  constructor(private readonly deps: UpdateStationTankRulesDeps) {}
  async execute(
    input: UpdateStationTankRulesCommand,
    ctx: ExecutionContext,
  ): Promise<Result<Station>> {
    const settings = tankRulesSettingsSchema.safeParse(input.settings);
    if (!input.id || !settings.success)
      return err(
        validationError('Invalid tank rules', {
          issues: settings.success ? undefined : settings.error.flatten(),
        }),
      );
    if (!mayChangeTankLevels(ctx))
      return err(forbiddenError('Only a user with tank-level permission can change these rules'));
    const existing = await this.deps.repository.lockForUpdate(input.id, ctx.organizationId);
    if (!existing) return err(notFoundError('Station', input.id));

    const submitted = settings.data;
    const levelsChanged =
      submitted[TANK_LEVEL_SETTINGS_KEY] !== undefined &&
      tankLevelsChanged(
        existing.settings[TANK_LEVEL_SETTINGS_KEY],
        submitted[TANK_LEVEL_SETTINGS_KEY],
      );
    const varianceChanged =
      submitted[STOCK_VARIANCE_TOLERANCE_KEY] !== undefined &&
      stockVarianceToleranceChanged(
        existing.settings[STOCK_VARIANCE_TOLERANCE_KEY],
        submitted[STOCK_VARIANCE_TOLERANCE_KEY],
      );
    if (!levelsChanged && !varianceChanged) return ok(existing);

    const patch: Record<string, unknown> = {};
    if (levelsChanged) patch[TANK_LEVEL_SETTINGS_KEY] = submitted[TANK_LEVEL_SETTINGS_KEY];
    if (varianceChanged)
      patch[STOCK_VARIANCE_TOLERANCE_KEY] = submitted[STOCK_VARIANCE_TOLERANCE_KEY];
    const updated = await this.deps.repository.patchSettings(
      existing.id,
      ctx.organizationId,
      patch,
      ctx.clock.now().toISOString(),
    );
    if (!updated) return err(notFoundError('Station', input.id));
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.STATION_UPDATED,
        aggregateType: 'Station',
        aggregateId: updated.id,
        stationId: updated.id,
        payload: {
          stationId: updated.id,
          ...(levelsChanged
            ? {
                tankLevels: {
                  before: resolveTankLevelSettings(existing.settings),
                  after: resolveTankLevelSettings(updated.settings),
                },
              }
            : {}),
          ...(varianceChanged
            ? {
                stockVarianceTolerancePct: {
                  before: resolveStockVarianceTolerance(existing.settings),
                  after: resolveStockVarianceTolerance(updated.settings),
                },
              }
            : {}),
        },
      }),
    ]);
    return ok(updated);
  }
}
