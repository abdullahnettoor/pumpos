import { z } from 'zod';
import { BusinessEvents, conflictError, err, eventFromContext, forbiddenError, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

export interface Supplier {
  id: string;
  organizationId: string;
  stationId: string | null;
  name: string;
  phone: string | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierRepository extends Repository<Supplier> {
  existsByName(organizationId: string, name: string, excludeId?: string): Promise<boolean>;
  listByOrganization(organizationId: string, activeOnly: boolean): Promise<Supplier[]>;
}

export interface CreateSupplierCommand {
  name: string;
  stationId?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateSupplierCommand {
  id: string;
  name?: string;
  phone?: string | null;
  metadata?: Record<string, unknown> | null;
  isActive?: boolean;
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(255),
  stationId: z.string().nullish(),
  phone: z.string().max(50).nullish(),
  metadata: z.record(z.any()).nullish(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(255).optional(),
  phone: z.string().max(50).nullish(),
  metadata: z.record(z.any()).nullish(),
  isActive: z.boolean().optional(),
});

export interface SupplierDeps {
  repository: SupplierRepository;
  events: EventPublisher;
}

export class CreateSupplier implements UseCase<CreateSupplierCommand, Supplier> {
  constructor(private readonly deps: SupplierDeps) {}
  async execute(input: CreateSupplierCommand, ctx: ExecutionContext): Promise<Result<Supplier>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateSupplier command', { issues: p.error.flatten() }));
    if (await this.deps.repository.existsByName(ctx.organizationId, p.data.name)) {
      return err(conflictError(`A supplier named "${p.data.name}" already exists`, { name: p.data.name }));
    }
    const now = ctx.clock.now().toISOString();
    const supplier: Supplier = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: p.data.stationId ?? null,
      name: p.data.name,
      phone: p.data.phone ?? null,
      metadata: p.data.metadata ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save(supplier);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SUPPLIER_CREATED,
        aggregateType: 'Supplier',
        aggregateId: supplier.id,
        payload: { supplierId: supplier.id, name: supplier.name },
      }),
    ]);
    return ok(supplier);
  }
}

export class UpdateSupplier implements UseCase<UpdateSupplierCommand, Supplier> {
  constructor(private readonly deps: SupplierDeps) {}
  async execute(input: UpdateSupplierCommand, ctx: ExecutionContext): Promise<Result<Supplier>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateSupplier command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing) return err(notFoundError('Supplier', p.data.id));
    if (existing.organizationId !== ctx.organizationId) return err(forbiddenError('Supplier belongs to another organization'));
    if (p.data.name !== undefined && p.data.name !== existing.name && (await this.deps.repository.existsByName(ctx.organizationId, p.data.name, existing.id))) {
      return err(conflictError(`A supplier named "${p.data.name}" already exists`, { name: p.data.name }));
    }
    const updated: Supplier = {
      ...existing,
      name: p.data.name ?? existing.name,
      phone: p.data.phone !== undefined ? p.data.phone : existing.phone,
      metadata: p.data.metadata !== undefined ? p.data.metadata : existing.metadata,
      isActive: p.data.isActive ?? existing.isActive,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.SUPPLIER_UPDATED,
        aggregateType: 'Supplier',
        aggregateId: updated.id,
        payload: { supplierId: updated.id },
      }),
    ]);
    return ok(updated);
  }
}
