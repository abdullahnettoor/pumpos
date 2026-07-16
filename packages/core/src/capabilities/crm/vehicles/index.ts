import { z } from 'zod';
import { BusinessEvents, err, eventFromContext, forbiddenError, notFoundError, ok, validationError } from '../../../kernel/index.js';
import type { EventPublisher, ExecutionContext, Repository, Result, UseCase } from '../../../kernel/index.js';
import type { CustomerRepository } from '../customers/index.js';

export interface Vehicle {
  id: string;
  organizationId: string;
  customerId: string;
  registrationNumber: string;
  vehicleType: string;
  defaultProductId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleRepository extends Repository<Vehicle> {
  listByCustomer(customerId: string, activeOnly: boolean): Promise<Vehicle[]>;
  existsByRegistration(organizationId: string, registrationNumber: string, excludeId?: string): Promise<boolean>;
}

export interface AddVehicleCommand {
  customerId: string;
  registrationNumber: string;
  vehicleType: string;
  defaultProductId?: string | null;
}

export interface UpdateVehicleCommand {
  id: string;
  registrationNumber?: string;
  vehicleType?: string;
  defaultProductId?: string | null;
  isActive?: boolean;
}

const addSchema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  registrationNumber: z.string().trim().min(3, 'registration number is required').max(50),
  vehicleType: z.string().trim().min(2, 'vehicle type is required').max(50),
  defaultProductId: z.string().nullish(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  registrationNumber: z.string().trim().min(3).max(50).optional(),
  vehicleType: z.string().trim().min(2).max(50).optional(),
  defaultProductId: z.string().nullish(),
  isActive: z.boolean().optional(),
});

function normalizeReg(reg: string): string {
  return reg.replace(/\s+/g, '').toUpperCase();
}

export interface VehicleDeps {
  repository: VehicleRepository;
  customers: CustomerRepository;
  events: EventPublisher;
}

export class AddVehicle implements UseCase<AddVehicleCommand, Vehicle> {
  constructor(private readonly deps: VehicleDeps) {}
  async execute(input: AddVehicleCommand, ctx: ExecutionContext): Promise<Result<Vehicle>> {
    const p = addSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid AddVehicle command', { issues: p.error.flatten() }));
    const customer = await this.deps.customers.findById(p.data.customerId);
    if (!customer || customer.organizationId !== ctx.organizationId) return err(notFoundError('Customer', p.data.customerId));
    const registrationNumber = normalizeReg(p.data.registrationNumber);
    if (await this.deps.repository.existsByRegistration(ctx.organizationId, registrationNumber)) {
      return err(validationError(`A vehicle ${registrationNumber} already exists`, { registrationNumber }));
    }
    const now = ctx.clock.now().toISOString();
    const vehicle: Vehicle = {
      id: ctx.ids.newId(),
      organizationId: ctx.organizationId,
      customerId: customer.id,
      registrationNumber,
      vehicleType: p.data.vehicleType,
      defaultProductId: p.data.defaultProductId ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.save(vehicle);
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: BusinessEvents.VEHICLE_ADDED,
        aggregateType: 'Vehicle',
        aggregateId: vehicle.id,
        payload: { vehicleId: vehicle.id, customerId: customer.id, registrationNumber },
      }),
    ]);
    return ok(vehicle);
  }
}

export class UpdateVehicle implements UseCase<UpdateVehicleCommand, Vehicle> {
  constructor(private readonly deps: VehicleDeps) {}
  async execute(input: UpdateVehicleCommand, ctx: ExecutionContext): Promise<Result<Vehicle>> {
    const p = updateSchema.safeParse(input);
    if (!p.success) return err(validationError('Invalid UpdateVehicle command', { issues: p.error.flatten() }));
    const existing = await this.deps.repository.findById(p.data.id);
    if (!existing) return err(notFoundError('Vehicle', p.data.id));
    if (existing.organizationId !== ctx.organizationId) return err(forbiddenError('Vehicle belongs to another organization'));
    const registrationNumber = p.data.registrationNumber !== undefined ? normalizeReg(p.data.registrationNumber) : existing.registrationNumber;
    if (registrationNumber !== existing.registrationNumber && (await this.deps.repository.existsByRegistration(ctx.organizationId, registrationNumber, existing.id))) {
      return err(validationError(`A vehicle ${registrationNumber} already exists`, { registrationNumber }));
    }
    const updated: Vehicle = {
      ...existing,
      registrationNumber,
      vehicleType: p.data.vehicleType ?? existing.vehicleType,
      defaultProductId: p.data.defaultProductId !== undefined ? p.data.defaultProductId : existing.defaultProductId,
      isActive: p.data.isActive ?? existing.isActive,
      updatedAt: ctx.clock.now().toISOString(),
    };
    await this.deps.repository.save(updated);
    const removed = updated.isActive === false && existing.isActive === true;
    await this.deps.events.publish([
      eventFromContext(ctx, {
        eventType: removed ? BusinessEvents.VEHICLE_REMOVED : BusinessEvents.VEHICLE_UPDATED,
        aggregateType: 'Vehicle',
        aggregateId: updated.id,
        payload: { vehicleId: updated.id, customerId: updated.customerId },
      }),
    ]);
    return ok(updated);
  }
}
