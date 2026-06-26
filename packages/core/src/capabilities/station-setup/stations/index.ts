import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

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

export interface StationRepository extends Repository<Station> {
  listByOrganization(organizationId: string): Promise<Station[]>;
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

export interface StationDeps {
  repository: StationRepository;
  events: EventPublisher;
}

export class CreateStation implements UseCase<CreateStationCommand, Station> {
  constructor(private readonly deps: StationDeps) {}
  async execute(input: CreateStationCommand, ctx: ExecutionContext): Promise<Result<Station>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateStation command', { issues: p.error.flatten() }));
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
    if (!p.success) return err(validationError('Invalid UpdateStation command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing || existing.organizationId !== ctx.organizationId) return err(notFoundError('Station', p.data.id));
    const updated: Station = {
      ...existing,
      name: p.data.name ?? existing.name,
      code: p.data.code ?? existing.code,
      address: p.data.address !== undefined ? p.data.address : existing.address,
      phone: p.data.phone !== undefined ? p.data.phone : existing.phone,
      settings: p.data.settings ?? existing.settings,
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
        payload: { stationId: updated.id },
      }),
    ]);
    return ok(updated);
  }
}
