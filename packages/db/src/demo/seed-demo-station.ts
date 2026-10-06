import { eq } from 'drizzle-orm';
import * as schema from '../schema.js';
import type { DbExecutor } from '../client.js';

export interface SeedDemoStationOptions {
  organizationId: string;
  ownerUserId: string;
  stationName?: string;
  town?: string;
  tanks?: number;
  nozzles?: number;
  attendants?: number;
}

const DEFAULTS = {
  stationName: 'Sample Fuels',
  town: 'Thrissur',
  tanks: 2,
  nozzles: 6,
  attendants: 3,
};

/**
 * Provision a demo station's master data (setup, people, customers, suppliers)
 * with generated IDs inside the caller's transaction.
 *
 * Operational history is NOT written here: it goes through the core use-cases
 * in `apps/api/src/services/demo/demo-history.ts`, so snapshots, ledger
 * entries and events have the shapes the app writes. Not used by
 * `npm run db:seed`.
 */
export async function seedDemoStation(tx: DbExecutor, input: SeedDemoStationOptions) {
  const options = { ...DEFAULTS, ...input };
  for (const [name, value, min, max] of [
    ['tanks', options.tanks, 1, 20],
    ['nozzles', options.nozzles, 1, 60],
    ['attendants', options.attendants, 1, 50],
  ] as const) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
  }
  const [station] = await tx
    .insert(schema.stations)
    .values({
      organizationId: options.organizationId,
      name: options.stationName,
      code: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      address: options.town,
      settings: {
        shift_grace_minutes: 15,
        shift_lock_grace_days: 3,
        offline_warning_days: 3,
        offline_critical_days: 7,
        business_day_starts_at: '05:00',
        timezone: 'Asia/Kolkata',
        demo_setup: {
          tanks: options.tanks,
          nozzles: options.nozzles,
          attendants: options.attendants,
        },
      },
      onboardingStatus: 'COMPLETED',
      isActive: true,
    })
    .returning();
  const owner = await tx
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, options.ownerUserId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!owner || owner.organizationId !== options.organizationId)
    throw new Error('Owner does not belong to demo organization');
  const people = await tx
    .insert(schema.users)
    .values([
      {
        organizationId: options.organizationId,
        fullName: 'Mani Manager',
        email: 'manager@demo.pumpos.invalid',
        role: 'Manager',
      },
      {
        organizationId: options.organizationId,
        fullName: 'Anita Accountant',
        email: 'accountant@demo.pumpos.invalid',
        role: 'Accountant',
      },
      ...Array.from({ length: options.attendants }, (_, index) => ({
        organizationId: options.organizationId,
        fullName: ['Anitha S', 'Ravi K', 'Meera P'][index] ?? `Attendant ${index + 1}`,
        email: index === 0 ? 'attendant@demo.pumpos.invalid' : null,
        phone: `+91 00000 ${String(100 + index).padStart(5, '0')}`,
        status: 'ACTIVE',
        role: 'Attendant',
      })),
    ])
    .returning();
  await tx
    .insert(schema.userStationAssignments)
    .values([
      { userId: options.ownerUserId, stationId: station.id },
      ...people.map((person) => ({ userId: person.id, stationId: station.id })),
    ]);
  const products = await tx
    .insert(schema.products)
    .values([
      {
        organizationId: options.organizationId,
        name: 'Petrol',
        code: `DEMO-MS-${crypto.randomUUID().slice(0, 6)}`,
        productType: 'FUEL',
        inventoryType: 'BULK',
        stockTracked: true,
        unit: 'L',
        isActive: true,
      },
      {
        organizationId: options.organizationId,
        name: 'Diesel',
        code: `DEMO-HSD-${crypto.randomUUID().slice(0, 6)}`,
        productType: 'FUEL',
        inventoryType: 'BULK',
        stockTracked: true,
        unit: 'L',
        isActive: true,
      },
    ])
    .returning();
  await tx
    .insert(schema.products)
    .values([
      {
        organizationId: options.organizationId,
        name: 'Engine Oil 1L',
        code: `DEMO-OIL-${crypto.randomUUID().slice(0, 6)}`,
        productType: 'LUBRICANT',
        inventoryType: 'ITEM',
        stockTracked: true,
        unit: 'PCS',
        isActive: true,
      },
      {
        organizationId: options.organizationId,
        name: 'Coolant',
        code: `DEMO-COOL-${crypto.randomUUID().slice(0, 6)}`,
        productType: 'LUBRICANT',
        inventoryType: 'ITEM',
        stockTracked: true,
        unit: 'PCS',
        isActive: true,
      },
      {
        organizationId: options.organizationId,
        name: 'Grease',
        code: `DEMO-GREASE-${crypto.randomUUID().slice(0, 6)}`,
        productType: 'LUBRICANT',
        inventoryType: 'ITEM',
        stockTracked: true,
        unit: 'PCS',
        isActive: true,
      },
    ])
    .returning();
  await tx.insert(schema.shiftTemplates).values([
    {
      organizationId: options.organizationId,
      name: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
    },
    {
      organizationId: options.organizationId,
      name: 'Evening',
      startTime: '14:00',
      endTime: '22:00',
    },
  ]);
  const templates = await tx
    .select()
    .from(schema.shiftTemplates)
    .where(eq(schema.shiftTemplates.organizationId, options.organizationId));
  const fuels = products.filter((product) => product.productType === 'FUEL');
  await tx.insert(schema.paymentTerminals).values([
    {
      organizationId: options.organizationId,
      stationId: station.id,
      label: 'Card / UPI 1',
      provider: 'Demo Bank',
    },
    {
      organizationId: options.organizationId,
      stationId: station.id,
      label: 'Card / UPI 2',
      provider: 'Demo Bank',
    },
  ]);
  const financialAccounts = await tx
    .insert(schema.financialAccounts)
    .values([
      {
        organizationId: options.organizationId,
        stationId: station.id,
        accountType: 'CASH_IN_HAND',
        name: 'Cash in Hand',
      },
      {
        organizationId: options.organizationId,
        stationId: station.id,
        accountType: 'BANK',
        name: 'Demo Current Account',
      },
    ])
    .returning();
  const demoCustomers = await tx
    .insert(schema.customers)
    .values([
      {
        organizationId: options.organizationId,
        stationId: station.id,
        customerType: 'Fleet',
        name: 'KSRTC Depot Aluva',
        phone: '+91 00000 01001',
        creditLimit: '100000',
        fleetCode: 'KSRTC-ALV',
      },
      {
        organizationId: options.organizationId,
        stationId: station.id,
        customerType: 'Fleet',
        name: 'Malabar Transports',
        phone: '+91 00000 01002',
        creditLimit: '200000',
        fleetCode: 'MAL-TRN',
      },
      ...[
        ['Thrissur Logistics', 'Fleet', '75000'],
        ['St. Thomas School Buses', 'Credit', '50000'],
        ['Green Valley Cabs', 'Fleet', '40000'],
        ['Kerala Agro Traders', 'Credit', '30000'],
      ].map(([name, customerType, creditLimit], index) => ({
        organizationId: options.organizationId,
        stationId: station.id,
        customerType,
        name,
        phone: `+91 00000 0100${index + 3}`,
        creditLimit,
      })),
    ])
    .returning();
  const demoSuppliers = await tx
    .insert(schema.suppliers)
    .values([
      {
        organizationId: options.organizationId,
        stationId: station.id,
        name: 'Indian Oil Corporation',
        phone: '+91 00000 02001',
      },
      {
        organizationId: options.organizationId,
        stationId: station.id,
        name: 'Malabar Lubricants',
        phone: '+91 00000 02002',
      },
    ])
    .returning();
  const tanks = await tx
    .insert(schema.tanks)
    .values(
      Array.from({ length: options.tanks }, (_, index) => ({
        organizationId: options.organizationId,
        stationId: station.id,
        name: index === 0 ? 'MS Tank' : index === 1 ? 'HSD Tank' : `Tank ${index + 1}`,
        productId: fuels[index === 1 ? 1 : 0].id,
        capacity: '20000',
      })),
    )
    .returning();
  const dispensers = await tx
    .insert(schema.dispenserUnits)
    .values(
      Array.from({ length: Math.ceil(options.nozzles / 2) }, (_, index) => ({
        organizationId: options.organizationId,
        stationId: station.id,
        name: `DU-${index + 1}`,
        code: `DU-${index + 1}`,
      })),
    )
    .returning();
  await tx.insert(schema.nozzles).values(
    Array.from({ length: options.nozzles }, (_, index) => {
      const tank = tanks[index % tanks.length];
      return {
        organizationId: options.organizationId,
        stationId: station.id,
        duId: dispensers[Math.floor(index / 2) % dispensers.length].id,
        tankId: tank.id,
        productId: tank.productId,
        name: `N-${index + 1}`,
        currentReading: String(100_000 + index * 7_315),
        meterSerial: `DEMO-${crypto.randomUUID().slice(0, 8)}`,
      };
    }),
  );
  await tx.insert(schema.expenseCategories).values({
    organizationId: options.organizationId,
    name: 'Electricity',
  });
  const nozzles = await tx
    .select()
    .from(schema.nozzles)
    .where(eq(schema.nozzles.stationId, station.id));
  return {
    station,
    owner,
    people,
    tanks,
    dispensers,
    nozzles,
    products,
    customers: demoCustomers,
    suppliers: demoSuppliers,
    financialAccounts,
    templates,
  };
}
