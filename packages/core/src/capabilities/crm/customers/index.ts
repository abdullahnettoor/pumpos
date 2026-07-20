import { z } from 'zod';
import type { CustomerType } from '@pump/shared';
import { BusinessEvents, conflictError, err, eventFromContext, forbiddenError, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';

export interface Customer {
  id: string;
  organizationId: string;
  stationId: string | null;
  customerType: CustomerType;
  name: string;
  phone: string | null;
  creditLimit: string | null;
  fleetCode: string | null;
  isPrepaid: boolean;
  prepaidBalance: string;
  settlementCycle: 'OPEN' | 'EOD';
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerRepository extends Repository<Customer> {
  existsByName(organizationId: string, name: string, excludeId?: string): Promise<boolean>;
  listByOrganization(organizationId: string, activeOnly: boolean): Promise<Customer[]>;
}

export interface CreateCustomerCommand {
  name: string;
  customerType: CustomerType;
  stationId?: string | null;
  phone?: string | null;
  creditLimit?: number | string | null;
  fleetCode?: string | null;
  isPrepaid?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateCustomerCommand {
  id: string;
  name?: string;
  customerType?: CustomerType;
  phone?: string | null;
  creditLimit?: number | string | null;
  fleetCode?: string | null;
  isPrepaid?: boolean;
  settlementCycle?: 'OPEN' | 'EOD';
  metadata?: Record<string, unknown> | null;
  isActive?: boolean;
}

const customerTypeEnum = z.enum(['Regular', 'Credit', 'Fleet']);
const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(255),
  customerType: customerTypeEnum,
  stationId: z.string().nullish(),
  phone: z.string().max(50).nullish(),
  creditLimit: z.union([z.coerce.number(), z.string()]).nullish(),
  fleetCode: z.string().max(100).nullish(),
  isPrepaid: z.boolean().optional(),
  settlementCycle: z.enum(['OPEN', 'EOD']).optional(),
  metadata: z.record(z.any()).nullish(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(255).optional(),
  customerType: customerTypeEnum.optional(),
  phone: z.string().max(50).nullish(),
  creditLimit: z.union([z.coerce.number(), z.string()]).nullish(),
  fleetCode: z.string().max(100).nullish(),
  isPrepaid: z.boolean().optional(),
  settlementCycle: z.enum(['OPEN', 'EOD']).optional(),
  metadata: z.record(z.any()).nullish(),
  isActive: z.boolean().optional(),
});

function nz(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

export interface CustomerDeps {
  repository: CustomerRepository;
  events: EventPublisher;
}

export class CreateCustomer implements UseCase<CreateCustomerCommand, Customer> {
  constructor(private readonly deps: CustomerDeps) {}
  async execute(input: CreateCustomerCommand, ctx: ExecutionContext): Promise<Result<Customer>> {
    const p = createSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid CreateCustomer command', { issues: p.error.flatten() }));
    if (await this.deps.repository.existsByName(ctx.organizationId, p.data.name)) {
      return err(conflictError(`A customer named "${p.data.name}" already exists`, { name: p.data.name }));
    }
    const now = ctx.clock.now().toISOString();
    const customer: Customer = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      stationId: p.data.stationId ?? null,
      customerType: p.data.customerType,
      name: p.data.name,
      phone: p.data.phone ?? null,
      creditLimit: nz(p.data.creditLimit),
      fleetCode: p.data.fleetCode ?? null,
      isPrepaid: p.data.isPrepaid ?? false,
      prepaidBalance: '0',
      settlementCycle: p.data.settlementCycle ?? 'OPEN',
      metadata: p.data.metadata ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save(customer);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CUSTOMER_CREATED,
        aggregateType: 'Customer',
        aggregateId: customer.id,
        payload: { customerId: customer.id, customerType: customer.customerType, name: customer.name },
      }),
    ]);
    return ok(customer);
  }
}

export class UpdateCustomer implements UseCase<UpdateCustomerCommand, Customer> {
  constructor(private readonly deps: CustomerDeps) {}
  async execute(input: UpdateCustomerCommand, ctx: ExecutionContext): Promise<Result<Customer>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateCustomer command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing) return err(notFoundError('Customer', p.data.id));
    if (existing.organizationId !== ctx.organizationId) return err(forbiddenError('Customer belongs to another organization'));
    if (p.data.name !== undefined && p.data.name !== existing.name && (await this.deps.repository.existsByName(ctx.organizationId, p.data.name, existing.id))) {
      return err(conflictError(`A customer named "${p.data.name}" already exists`, { name: p.data.name }));
    }
    const updated: Customer = {
      ...existing,
      name: p.data.name ?? existing.name,
      customerType: p.data.customerType ?? existing.customerType,
      phone: p.data.phone !== undefined ? p.data.phone : existing.phone,
      creditLimit: p.data.creditLimit !== undefined ? nz(p.data.creditLimit) : existing.creditLimit,
      fleetCode: p.data.fleetCode !== undefined ? p.data.fleetCode : existing.fleetCode,
      isPrepaid: p.data.isPrepaid ?? existing.isPrepaid,
      settlementCycle: p.data.settlementCycle ?? existing.settlementCycle,
      metadata: p.data.metadata !== undefined ? p.data.metadata : existing.metadata,
      isActive: p.data.isActive ?? existing.isActive,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.CUSTOMER_UPDATED,
        aggregateType: 'Customer',
        aggregateId: updated.id,
        payload: { customerId: updated.id },
      }),
    ]);
    return ok(updated);
  }
}
