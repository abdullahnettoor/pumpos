import { eq } from 'drizzle-orm';
import {
  DEFAULT_DECANTATION_SETTINGS,
  createFuelVatConfig,
  type DecantationSettings,
} from '@pump/shared';
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

/**
 * Demo tax values. Fuel is outside GST: it carries state VAT embedded in the
 * pole price (`FUEL_VAT`, price-inclusive) and never a `gst_rate`. The rates
 * are demo values of Kerala sales tax on petrol and diesel; a real station
 * sets its own. Lubricants and merchandise are GST goods (HSN/SAC are demo
 * values too).
 */
export const DEMO_FUEL_TAX = {
  petrol: { vatRate: 30.08, hsn: '2710' },
  diesel: { vatRate: 22.76, hsn: '2710' },
} as const;

/** CNG (HSN 2711) is taxed as fuel VAT too, at its own demo rate. */
export const DEMO_CNG_TAX = { vatRate: 14.5, hsn: '2711' } as const;

/** Station clock the demo seeds are dated against. */
export const DEMO_STATION_CLOCK = { timeZone: 'Asia/Kolkata', dayStartsAt: '05:00' } as const;

export const demoFuelTax = (fuel: { vatRate: number; hsn: string }) => ({
  taxCategory: 'FUEL_VAT',
  isTaxable: false,
  taxConfig: createFuelVatConfig({ vat_rate: fuel.vatRate, hsn_code: fuel.hsn }),
});

const gstTax = (hsn: string) => ({
  taxCategory: 'GST',
  isTaxable: true,
  taxConfig: { gst_rate: 18, hsn_code: hsn },
});

/**
 * Demo decantation settings. Density specification bands (15 °C, kg/m³) are
 * demo station values keyed by product id once the products exist.
 */
export const DEMO_DECANTATION_SETTINGS: Omit<DecantationSettings, 'densitySpecBands'> = {
  ...DEFAULT_DECANTATION_SETTINGS,
  densityMethod: 'API_MPMS_11_1_ADJUNCT',
  densityToleranceKgM3: 3,
  quantityTolerance: 0.2,
  settlingTimeMinutes: 30,
  densityEntryMethod: 'HYDROMETER',
};
export const DEMO_DENSITY_BANDS = {
  petrol: { minKgM3: 720, maxKgM3: 775 },
  diesel: { minKgM3: 820, maxKgM3: 860 },
} as const;

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
        business_day_starts_at: DEMO_STATION_CLOCK.dayStartsAt,
        timezone: DEMO_STATION_CLOCK.timeZone,
        demo_setup: {
          tanks: options.tanks,
          nozzles: options.nozzles,
          attendants: options.attendants,
        },
      },
      onboardingStatus: 'READY_FOR_OPERATIONS',
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
        ...demoFuelTax(DEMO_FUEL_TAX.petrol),
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
        ...demoFuelTax(DEMO_FUEL_TAX.diesel),
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
        ...gstTax('2710'),
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
        ...gstTax('3820'),
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
        ...gstTax('3403'),
        isActive: true,
      },
    ])
    .returning();
  const [petrolProduct, dieselProduct] = products;
  await tx
    .update(schema.stations)
    .set({
      settings: {
        ...(station.settings as Record<string, unknown>),
        ...DEMO_DECANTATION_SETTINGS,
        densitySpecBands: {
          [petrolProduct.id]: DEMO_DENSITY_BANDS.petrol,
          [dieselProduct.id]: DEMO_DENSITY_BANDS.diesel,
        },
      },
    })
    .where(eq(schema.stations.id, station.id));
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
