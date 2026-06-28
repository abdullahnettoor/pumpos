import { and, eq, ne } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type {
  Customer,
  CustomerRepository,
  CustomerLedgerEntry,
  CustomerLedgerRepository,
  Collection,
  CollectionRepository,
  Supplier,
  SupplierRepository,
  Vehicle,
  VehicleRepository,
} from '@pump/core';

type Json = Record<string, unknown> | null;

// ---------------- Customers ----------------
export class DrizzleCustomerRepository implements CustomerRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.customers.$inferSelect): Customer {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      customerType: r.customerType as Customer['customerType'],
      name: r.name,
      phone: r.phone,
      creditLimit: r.creditLimit,
      fleetCode: r.fleetCode,
      isPrepaid: r.isPrepaid,
      prepaidBalance: r.prepaidBalance,
      metadata: (r.metadata as Json) ?? null,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<Customer | null> {
    const [r] = await this.db.select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(c: Customer): Promise<void> {
    await this.db
      .insert(schema.customers)
      .values({
        id: c.id,
        organizationId: c.organizationId,
        stationId: c.stationId,
        customerType: c.customerType,
        name: c.name,
        phone: c.phone,
        creditLimit: c.creditLimit,
        fleetCode: c.fleetCode,
        isPrepaid: c.isPrepaid,
        prepaidBalance: c.prepaidBalance,
        metadata: c.metadata,
        isActive: c.isActive,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.customers.id,
        set: {
          customerType: c.customerType,
          name: c.name,
          phone: c.phone,
          creditLimit: c.creditLimit,
          fleetCode: c.fleetCode,
          isPrepaid: c.isPrepaid,
          prepaidBalance: c.prepaidBalance,
          metadata: c.metadata,
          isActive: c.isActive,
          updatedAt: new Date(c.updatedAt),
        },
      });
  }
  async existsByName(organizationId: string, name: string, excludeId?: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.organizationId, organizationId),
          eq(schema.customers.name, name),
          ...(excludeId ? [ne(schema.customers.id, excludeId)] : []),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  async listByOrganization(organizationId: string, activeOnly: boolean): Promise<Customer[]> {
    const rows = await this.db
      .select()
      .from(schema.customers)
      .where(
        activeOnly
          ? and(eq(schema.customers.organizationId, organizationId), eq(schema.customers.isActive, true))
          : eq(schema.customers.organizationId, organizationId),
      );
    return rows.map((r) => this.toEntity(r));
  }
}

// ---------------- Customer Ledger ----------------
export class DrizzleCustomerLedgerRepository implements CustomerLedgerRepository {
  constructor(private readonly db: DbClient) {}
  async save(e: CustomerLedgerEntry): Promise<void> {
    await this.db.insert(schema.customerTransactions).values({
      id: e.id,
      shiftId: e.shiftId,
      businessDayId: e.businessDayId,
      customerId: e.customerId,
      vehicleId: e.vehicleId,
      productId: e.productId,
      attendantId: e.attendantId ?? null,
      transactionType: e.transactionType,
      amount: e.amount,
      quantity: e.quantity,
      unitPrice: e.unitPrice,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      notes: e.notes,
      createdAt: new Date(e.createdAt),
    });
  }
}

// ---------------- Collections ----------------
export class DrizzleCollectionRepository implements CollectionRepository {
  constructor(private readonly db: DbClient) {}
  async save(c: Collection): Promise<void> {
    await this.db.insert(schema.collections).values({
      id: c.id,
      documentNumber: c.documentNumber,
      shiftId: c.shiftId,
      businessDayId: c.businessDayId,
      customerId: c.customerId,
      vehicleId: c.vehicleId,
      amount: c.amount,
      paymentMethod: c.paymentMethod,
      notes: c.notes,
      createdAt: new Date(c.createdAt),
    });
  }
}

// ---------------- Suppliers ----------------
export class DrizzleSupplierRepository implements SupplierRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.suppliers.$inferSelect): Supplier {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      name: r.name,
      phone: r.phone,
      metadata: (r.metadata as Json) ?? null,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<Supplier | null> {
    const [r] = await this.db.select().from(schema.suppliers).where(eq(schema.suppliers.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(s: Supplier): Promise<void> {
    await this.db
      .insert(schema.suppliers)
      .values({
        id: s.id,
        organizationId: s.organizationId,
        stationId: s.stationId,
        name: s.name,
        phone: s.phone,
        metadata: s.metadata,
        isActive: s.isActive,
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.suppliers.id,
        set: { name: s.name, phone: s.phone, metadata: s.metadata, isActive: s.isActive, updatedAt: new Date(s.updatedAt) },
      });
  }
  async existsByName(organizationId: string, name: string, excludeId?: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(
        and(
          eq(schema.suppliers.organizationId, organizationId),
          eq(schema.suppliers.name, name),
          ...(excludeId ? [ne(schema.suppliers.id, excludeId)] : []),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  async listByOrganization(organizationId: string, activeOnly: boolean): Promise<Supplier[]> {
    const rows = await this.db
      .select()
      .from(schema.suppliers)
      .where(
        activeOnly
          ? and(eq(schema.suppliers.organizationId, organizationId), eq(schema.suppliers.isActive, true))
          : eq(schema.suppliers.organizationId, organizationId),
      );
    return rows.map((r) => this.toEntity(r));
  }
}

// ---------------- Vehicles ----------------
export class DrizzleVehicleRepository implements VehicleRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.customerVehicles.$inferSelect): Vehicle {
    return {
      id: r.id,
      organizationId: r.organizationId,
      customerId: r.customerId,
      registrationNumber: r.registrationNumber,
      vehicleType: r.vehicleType,
      defaultProductId: r.defaultProductId,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<Vehicle | null> {
    const [r] = await this.db.select().from(schema.customerVehicles).where(eq(schema.customerVehicles.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(v: Vehicle): Promise<void> {
    await this.db
      .insert(schema.customerVehicles)
      .values({
        id: v.id,
        organizationId: v.organizationId,
        customerId: v.customerId,
        registrationNumber: v.registrationNumber,
        vehicleType: v.vehicleType,
        defaultProductId: v.defaultProductId,
        isActive: v.isActive,
        createdAt: new Date(v.createdAt),
        updatedAt: new Date(v.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.customerVehicles.id,
        set: {
          registrationNumber: v.registrationNumber,
          vehicleType: v.vehicleType,
          defaultProductId: v.defaultProductId,
          isActive: v.isActive,
          updatedAt: new Date(v.updatedAt),
        },
      });
  }
  async listByCustomer(customerId: string, activeOnly: boolean): Promise<Vehicle[]> {
    const rows = await this.db
      .select()
      .from(schema.customerVehicles)
      .where(
        activeOnly
          ? and(eq(schema.customerVehicles.customerId, customerId), eq(schema.customerVehicles.isActive, true))
          : eq(schema.customerVehicles.customerId, customerId),
      );
    return rows.map((r) => this.toEntity(r));
  }
  async existsByRegistration(organizationId: string, registrationNumber: string, excludeId?: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.customerVehicles.id })
      .from(schema.customerVehicles)
      .where(
        and(
          eq(schema.customerVehicles.organizationId, organizationId),
          eq(schema.customerVehicles.registrationNumber, registrationNumber),
          ...(excludeId ? [ne(schema.customerVehicles.id, excludeId)] : []),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
