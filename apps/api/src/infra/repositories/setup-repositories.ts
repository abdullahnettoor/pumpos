import { and, eq, inArray, desc } from 'drizzle-orm';
import { schema, type DbClient } from '@pump/db';
import type { Role } from '@pump/shared';
import type {
  Tank,
  TankRepository,
  DispenserUnit,
  DispenserRepository,
  Nozzle,
  NozzleRepository,
  ShiftTemplate,
  ShiftTemplateRepository,
  Station,
  StationRepository,
  User,
  UserWithAssignments,
  UserRepository,
  FuelPrice,
  FuelPriceRepository,
} from '@pump/core';

// ---------------- Tanks ----------------
export class DrizzleTankRepository implements TankRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.tanks.$inferSelect): Tank {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      name: r.name,
      productId: r.productId,
      capacity: r.capacity,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<Tank | null> {
    const [r] = await this.db.select().from(schema.tanks).where(eq(schema.tanks.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(t: Tank): Promise<void> {
    await this.db
      .insert(schema.tanks)
      .values({ id: t.id, organizationId: t.organizationId, stationId: t.stationId, name: t.name, productId: t.productId, capacity: t.capacity, createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt) })
      .onConflictDoUpdate({ target: schema.tanks.id, set: { name: t.name, productId: t.productId, capacity: t.capacity, updatedAt: new Date(t.updatedAt) } });
  }
  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.tanks).where(eq(schema.tanks.id, id)).returning({ id: schema.tanks.id });
    return rows.length > 0;
  }
  async listByStation(organizationId: string, stationId: string): Promise<Tank[]> {
    const rows = await this.db.select().from(schema.tanks).where(and(eq(schema.tanks.organizationId, organizationId), eq(schema.tanks.stationId, stationId)));
    return rows.map((r) => this.toEntity(r));
  }
}

// ---------------- Dispensers ----------------
export class DrizzleDispenserRepository implements DispenserRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.dispenserUnits.$inferSelect): DispenserUnit {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      name: r.name,
      code: r.code,
      status: r.status as DispenserUnit['status'],
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<DispenserUnit | null> {
    const [r] = await this.db.select().from(schema.dispenserUnits).where(eq(schema.dispenserUnits.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(d: DispenserUnit): Promise<void> {
    await this.db
      .insert(schema.dispenserUnits)
      .values({ id: d.id, organizationId: d.organizationId, stationId: d.stationId, name: d.name, code: d.code, status: d.status, createdAt: new Date(d.createdAt), updatedAt: new Date(d.updatedAt) })
      .onConflictDoUpdate({ target: schema.dispenserUnits.id, set: { name: d.name, code: d.code, status: d.status, updatedAt: new Date(d.updatedAt) } });
  }
  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.dispenserUnits).where(eq(schema.dispenserUnits.id, id)).returning({ id: schema.dispenserUnits.id });
    return rows.length > 0;
  }
  async listByStation(organizationId: string, stationId: string): Promise<DispenserUnit[]> {
    const rows = await this.db.select().from(schema.dispenserUnits).where(and(eq(schema.dispenserUnits.organizationId, organizationId), eq(schema.dispenserUnits.stationId, stationId)));
    return rows.map((r) => this.toEntity(r));
  }
}

// ---------------- Nozzles ----------------
export class DrizzleNozzleRepository implements NozzleRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.nozzles.$inferSelect): Nozzle {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      duId: r.duId,
      tankId: r.tankId,
      productId: r.productId,
      name: r.name,
      currentReading: r.currentReading,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<Nozzle | null> {
    const [r] = await this.db.select().from(schema.nozzles).where(eq(schema.nozzles.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(n: Nozzle): Promise<void> {
    await this.db
      .insert(schema.nozzles)
      .values({ id: n.id, organizationId: n.organizationId, stationId: n.stationId, duId: n.duId, tankId: n.tankId, productId: n.productId, name: n.name, currentReading: n.currentReading, createdAt: new Date(n.createdAt), updatedAt: new Date(n.updatedAt) })
      .onConflictDoUpdate({ target: schema.nozzles.id, set: { duId: n.duId, tankId: n.tankId, productId: n.productId, name: n.name, currentReading: n.currentReading, updatedAt: new Date(n.updatedAt) } });
  }
  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.nozzles).where(eq(schema.nozzles.id, id)).returning({ id: schema.nozzles.id });
    return rows.length > 0;
  }
  async listByStation(organizationId: string, stationId: string): Promise<Nozzle[]> {
    const rows = await this.db.select().from(schema.nozzles).where(and(eq(schema.nozzles.organizationId, organizationId), eq(schema.nozzles.stationId, stationId)));
    return rows.map((r) => this.toEntity(r));
  }
}

// ---------------- Shift Templates ----------------
export class DrizzleShiftTemplateRepository implements ShiftTemplateRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.shiftTemplates.$inferSelect): ShiftTemplate {
    return {
      id: r.id,
      organizationId: r.organizationId,
      name: r.name,
      startTime: r.startTime,
      endTime: r.endTime,
      isActive: r.isActive,
    };
  }
  async findById(id: string): Promise<ShiftTemplate | null> {
    const [r] = await this.db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(t: ShiftTemplate): Promise<void> {
    await this.db
      .insert(schema.shiftTemplates)
      .values({ id: t.id, organizationId: t.organizationId, name: t.name, startTime: t.startTime, endTime: t.endTime, isActive: t.isActive })
      .onConflictDoUpdate({ target: schema.shiftTemplates.id, set: { name: t.name, startTime: t.startTime, endTime: t.endTime, isActive: t.isActive } });
  }
  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.shiftTemplates).where(eq(schema.shiftTemplates.id, id)).returning({ id: schema.shiftTemplates.id });
    return rows.length > 0;
  }
  async listByOrganization(organizationId: string): Promise<ShiftTemplate[]> {
    const rows = await this.db.select().from(schema.shiftTemplates).where(eq(schema.shiftTemplates.organizationId, organizationId));
    return rows.map((r) => this.toEntity(r));
  }
}

// ---------------- Stations ----------------
export class DrizzleStationRepository implements StationRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.stations.$inferSelect): Station {
    return {
      id: r.id,
      organizationId: r.organizationId,
      name: r.name,
      code: r.code,
      address: r.address,
      phone: r.phone,
      settings: (r.settings ?? {}) as Record<string, unknown>,
      onboardingStatus: r.onboardingStatus,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<Station | null> {
    const [r] = await this.db.select().from(schema.stations).where(eq(schema.stations.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(s: Station): Promise<void> {
    await this.db
      .insert(schema.stations)
      .values({ id: s.id, organizationId: s.organizationId, name: s.name, code: s.code, address: s.address, phone: s.phone, settings: s.settings, onboardingStatus: s.onboardingStatus, isActive: s.isActive, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) })
      .onConflictDoUpdate({ target: schema.stations.id, set: { name: s.name, code: s.code, address: s.address, phone: s.phone, settings: s.settings, onboardingStatus: s.onboardingStatus, isActive: s.isActive, updatedAt: new Date(s.updatedAt) } });
  }
  async listByOrganization(organizationId: string): Promise<Station[]> {
    const rows = await this.db.select().from(schema.stations).where(eq(schema.stations.organizationId, organizationId));
    return rows.map((r) => this.toEntity(r));
  }
}

// ---------------- Users ----------------
export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.users.$inferSelect): User {
    return {
      id: r.id,
      organizationId: r.organizationId,
      authUserId: r.authUserId,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      role: r.role as Role,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  async findById(id: string): Promise<User | null> {
    const [r] = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return r ? this.toEntity(r) : null;
  }
  async save(u: User): Promise<void> {
    await this.db
      .insert(schema.users)
      .values({ id: u.id, organizationId: u.organizationId, authUserId: u.authUserId, fullName: u.fullName, email: u.email, phone: u.phone, role: u.role, status: u.status, createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt) })
      .onConflictDoUpdate({ target: schema.users.id, set: { fullName: u.fullName, email: u.email, phone: u.phone, role: u.role, status: u.status, updatedAt: new Date(u.updatedAt) } });
  }
  async setStationAssignments(userId: string, stationIds: string[]): Promise<void> {
    await this.db.delete(schema.userStationAssignments).where(eq(schema.userStationAssignments.userId, userId));
    if (stationIds.length > 0) {
      await this.db.insert(schema.userStationAssignments).values(stationIds.map((stationId) => ({ userId, stationId })));
    }
  }
  async listWithAssignments(organizationId: string): Promise<UserWithAssignments[]> {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.organizationId, organizationId));
    const ids = rows.map((r) => r.id);
    const assigns = ids.length > 0
      ? await this.db.select().from(schema.userStationAssignments).where(inArray(schema.userStationAssignments.userId, ids))
      : [];
    const byUser = new Map<string, string[]>();
    for (const a of assigns) {
      const arr = byUser.get(a.userId) ?? [];
      arr.push(a.stationId);
      byUser.set(a.userId, arr);
    }
    return rows.map((r) => ({ ...this.toEntity(r), stationIds: byUser.get(r.id) ?? [] }));
  }
}

// ---------------- Fuel Prices ----------------
export class DrizzleFuelPriceRepository implements FuelPriceRepository {
  constructor(private readonly db: DbClient) {}
  private toEntity(r: typeof schema.fuelPrices.$inferSelect): FuelPrice {
    return {
      id: r.id,
      organizationId: r.organizationId,
      stationId: r.stationId,
      productId: r.productId,
      price: r.price,
      effectiveFrom: r.effectiveFrom.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  }
  async save(p: FuelPrice): Promise<void> {
    await this.db.insert(schema.fuelPrices).values({ id: p.id, organizationId: p.organizationId, stationId: p.stationId, productId: p.productId, price: p.price, effectiveFrom: new Date(p.effectiveFrom), createdAt: new Date(p.createdAt) });
  }
  async listByStation(organizationId: string, stationId: string): Promise<FuelPrice[]> {
    const rows = await this.db
      .select()
      .from(schema.fuelPrices)
      .where(and(eq(schema.fuelPrices.organizationId, organizationId), eq(schema.fuelPrices.stationId, stationId)))
      .orderBy(desc(schema.fuelPrices.effectiveFrom));
    return rows.map((r) => this.toEntity(r));
  }
}
