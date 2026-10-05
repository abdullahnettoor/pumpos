/**
 * Rich demo seed for the v2 architecture. Idempotent (fixed UUIDs +
 * ON CONFLICT DO NOTHING) so it can be re-run safely.
 *
 * Run from packages/db:  set -a; . ./.env; set +a; node seed.mjs
 *
 * Seeds one demo organization with full master data plus one business day
 * containing a closed morning shift and an open evening shift, exercising the
 * business-day vs shift anchoring (fuel readings, merchandise sale, drawer vs
 * business expense, day-anchored purchase, credit sale + collection).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { resolveBusinessDate } from '@pump/shared';
import * as schema from './dist/schema.js';

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DIRECT_DATABASE_URL / DATABASE_URL');
  process.exit(2);
}

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

// ---- Deterministic IDs ----
const ID = {
  org: process.env.DEMO_ORG_ID || '36500000-0000-4000-8000-000000000001',
  station: '00000000-0000-4000-8000-000000000010',
  userOwner: '00000000-0000-4000-8000-000000000101',
  userManager: '00000000-0000-4000-8000-000000000102',
  userAccountant: '00000000-0000-4000-8000-000000000103',
  userStaff: '00000000-0000-4000-8000-000000000104',
  attendantAnitha: '00000000-0000-4000-8000-000000000105',
  attendantRavi: '00000000-0000-4000-8000-000000000106',
  attendantMeera: '00000000-0000-4000-8000-000000000107',
  attendantJomon: '00000000-0000-4000-8000-000000000108',
  prodPetrol: '00000000-0000-4000-8000-000000000201',
  prodDiesel: '00000000-0000-4000-8000-000000000202',
  prodCng: '00000000-0000-4000-8000-000000000203',
  prodOil: '00000000-0000-4000-8000-000000000204',
  prodCoolant: '00000000-0000-4000-8000-000000000205',
  prodWasher: '00000000-0000-4000-8000-000000000206',
  prodService: '00000000-0000-4000-8000-000000000207',
  tankPetrol: '00000000-0000-4000-8000-000000000301',
  tankDiesel: '00000000-0000-4000-8000-000000000302',
  du1: '00000000-0000-4000-8000-000000000401',
  du2: '00000000-0000-4000-8000-000000000402',
  du3: '00000000-0000-4000-8000-000000000403',
  nzP1: '00000000-0000-4000-8000-000000000501',
  nzP2: '00000000-0000-4000-8000-000000000502',
  nzD1: '00000000-0000-4000-8000-000000000503',
  nzD2: '00000000-0000-4000-8000-000000000504',
  nzP3: '00000000-0000-4000-8000-000000000505',
  nzD3: '00000000-0000-4000-8000-000000000506',
  term1: '00000000-0000-4000-8000-000000000601',
  term2: '00000000-0000-4000-8000-000000000602',
  tplMorning: '00000000-0000-4000-8000-000000000701',
  tplEvening: '00000000-0000-4000-8000-000000000702',
  catFuelPurchase: '00000000-0000-4000-8000-000000000801',
  catUtilities: '00000000-0000-4000-8000-000000000802',
  catMisc: '00000000-0000-4000-8000-000000000803',
  supplierIoc: '00000000-0000-4000-8000-000000000901',
  supplierLube: '00000000-0000-4000-8000-000000000902',
  custRegular: '00000000-0000-4000-8000-000000000a01',
  custCredit: '00000000-0000-4000-8000-000000000a02',
  custFleet: '00000000-0000-4000-8000-000000000a03',
  custKsrtc: '00000000-0000-4000-8000-000000000a04',
  custMalabar: '00000000-0000-4000-8000-000000000a05',
  custPeriyar: '00000000-0000-4000-8000-000000000a06',
  custCoastal: '00000000-0000-4000-8000-000000000a07',
  custGreenline: '00000000-0000-4000-8000-000000000a08',
  custMetro: '00000000-0000-4000-8000-000000000a09',
  vehFleet1: '00000000-0000-4000-8000-000000000b01',
  vehFleet2: '00000000-0000-4000-8000-000000000b02',
  bday: '00000000-0000-4000-8000-000000000c01',
  shiftMorning: '00000000-0000-4000-8000-000000000d01',
  shiftEvening: '00000000-0000-4000-8000-000000000d02',
  saleOil: '00000000-0000-4000-8000-000000000e01',
  saleItemOil: '00000000-0000-4000-8000-000000000e02',
  expDrawer: '00000000-0000-4000-8000-000000000f01',
  expBank: '00000000-0000-4000-8000-000000000f02',
  purchaseFuel: '00000000-0000-4000-8000-000000001001',
  creditTxn: '00000000-0000-4000-8000-000000001101',
  collection1: '00000000-0000-4000-8000-000000001201',
  mvPurchase: '00000000-0000-4000-8000-000000001301',
  mvSalePetrol: '00000000-0000-4000-8000-000000001302',
  accCash: '00000000-0000-4000-8000-000000001401',
  accPetty: '00000000-0000-4000-8000-000000001402',
  accBank: '00000000-0000-4000-8000-000000001403',
};
// Keep this fixture's deterministic IDs disjoint from the general-purpose
// development seed, which uses the 00000000 UUID namespace.
for (const key of Object.keys(ID)) {
  if (key !== 'org') ID[key] = ID[key].replace(/^00000000/, '36500000');
}

const timeZone = 'Asia/Kolkata';
const dayStartsAt = '05:00';
const businessDate = resolveBusinessDate({ timeZone, dayStartsAt });
const nz = (v) => String(v);

async function main() {
  await db
    .insert(schema.organizations)
    .values({
      id: ID.org,
      name: 'Sample Fuels (Demo)',
      subscriptionPlan: 'CORE',
      subscriptionStatus: 'ACTIVE',
    })
    .onConflictDoNothing();

  await db
    .insert(schema.users)
    .values([
      {
        id: ID.userOwner,
        organizationId: ID.org,
        fullName: 'Asha Owner',
        email: 'owner@demo.pumpos.invalid',
        role: 'Owner',
        status: 'ACTIVE',
      },
      {
        id: ID.userManager,
        organizationId: ID.org,
        fullName: 'Mani Manager',
        email: 'manager@demo.pumpos.invalid',
        role: 'Manager',
        status: 'ACTIVE',
      },
      {
        id: ID.userAccountant,
        organizationId: ID.org,
        fullName: 'Anita Accountant',
        email: 'accountant@demo.pumpos.invalid',
        role: 'Accountant',
        status: 'ACTIVE',
      },
      {
        id: ID.userStaff,
        organizationId: ID.org,
        fullName: 'Anitha S',
        email: 'attendant@demo.pumpos.invalid',
        phone: '+91 00000 00101',
        role: 'Attendant',
        status: 'ACTIVE',
      },
      ...[
        [ID.attendantRavi, 'Ravi K', '+91 00000 00102'],
        [ID.attendantMeera, 'Meera P', '+91 00000 00103'],
        [ID.attendantJomon, 'Jomon T', '+91 00000 00104'],
      ].map(([id, fullName, phone]) => ({
        id,
        organizationId: ID.org,
        fullName,
        phone,
        role: 'Attendant',
        status: 'ACTIVE',
      })),
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.stations)
    .values({
      id: ID.station,
      organizationId: ID.org,
      name: 'Sample Fuels, Thrissur',
      code: 'SAMPLE-01',
      address: 'Thrissur, Kerala',
      phone: '+91 00000 00000',
      settings: {
        shift_grace_minutes: 15,
        shift_lock_grace_days: 3,
        offline_warning_days: 3,
        offline_critical_days: 7,
        business_day_starts_at: dayStartsAt,
        timezone: timeZone,
      },
      onboardingStatus: 'COMPLETED',
      isActive: true,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.userStationAssignments)
    .values([
      { userId: ID.userOwner, stationId: ID.station },
      { userId: ID.userManager, stationId: ID.station },
      ...[ID.userStaff, ID.attendantRavi, ID.attendantMeera, ID.attendantJomon]
        .map((userId) => ({ userId, stationId: ID.station })),
    ])
    .onConflictDoNothing();

  await syncDemoAuthUsers();

  await db
    .insert(schema.products)
    .values([
      {
        id: ID.prodPetrol,
        organizationId: ID.org,
        name: 'Petrol XP95',
        code: 'FUEL-PET',
        productType: 'FUEL',
        inventoryType: 'BULK',
        stockTracked: true,
        isTaxable: false,
        unit: 'L',
      },
      {
        id: ID.prodDiesel,
        organizationId: ID.org,
        name: 'Diesel',
        code: 'FUEL-DSL',
        productType: 'FUEL',
        inventoryType: 'BULK',
        stockTracked: true,
        isTaxable: false,
        unit: 'L',
      },
      {
        id: ID.prodCng,
        organizationId: ID.org,
        name: 'CNG',
        code: 'FUEL-CNG',
        productType: 'FUEL',
        inventoryType: 'BULK',
        stockTracked: true,
        isTaxable: false,
        unit: 'kg',
      },
      {
        id: ID.prodOil,
        organizationId: ID.org,
        name: 'Servo 20W40 1L',
        code: 'LUB-2040',
        productType: 'LUBRICANT',
        inventoryType: 'ITEM',
        stockTracked: true,
        isTaxable: true,
        unit: 'pc',
      },
      {
        id: ID.prodCoolant,
        organizationId: ID.org,
        name: 'Coolant 500ml',
        code: 'LUB-COOL',
        productType: 'LUBRICANT',
        inventoryType: 'ITEM',
        stockTracked: true,
        isTaxable: true,
        unit: 'pc',
      },
      {
        id: ID.prodWasher,
        organizationId: ID.org,
        name: 'Windshield Fluid 1L',
        code: 'ACC-WSH',
        productType: 'ACCESSORY',
        inventoryType: 'ITEM',
        stockTracked: true,
        isTaxable: true,
        unit: 'pc',
      },
      {
        id: ID.prodService,
        organizationId: ID.org,
        name: 'Air Check Service',
        code: 'SVC-AIR',
        productType: 'SERVICE',
        inventoryType: 'NONE',
        stockTracked: false,
        isTaxable: true,
        unit: 'job',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.tanks)
    .values([
      {
        id: ID.tankPetrol,
        organizationId: ID.org,
        stationId: ID.station,
        name: 'Tank A (Petrol)',
        productId: ID.prodPetrol,
        capacity: nz(20000),
      },
      {
        id: ID.tankDiesel,
        organizationId: ID.org,
        stationId: ID.station,
        name: 'Tank B (Diesel)',
        productId: ID.prodDiesel,
        capacity: nz(20000),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.dispenserUnits)
    .values([
      {
        id: ID.du1,
        organizationId: ID.org,
        stationId: ID.station,
        name: 'DU-1',
        code: 'DU1',
        status: 'ACTIVE',
      },
      {
        id: ID.du2,
        organizationId: ID.org,
        stationId: ID.station,
        name: 'DU-2',
        code: 'DU2',
        status: 'ACTIVE',
      },
      {
        id: ID.du3,
        organizationId: ID.org,
        stationId: ID.station,
        name: 'Dispenser 3',
        code: 'DU-3',
        status: 'ACTIVE',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.nozzles)
    .values([
      {
        id: ID.nzP1,
        organizationId: ID.org,
        stationId: ID.station,
        duId: ID.du1,
        tankId: ID.tankPetrol,
        productId: ID.prodPetrol,
        name: 'DU1-Petrol',
        currentReading: nz(125000),
      },
      {
        id: ID.nzD1,
        organizationId: ID.org,
        stationId: ID.station,
        duId: ID.du1,
        tankId: ID.tankDiesel,
        productId: ID.prodDiesel,
        name: 'DU1-Diesel',
        currentReading: nz(98000),
      },
      {
        id: ID.nzP2,
        organizationId: ID.org,
        stationId: ID.station,
        duId: ID.du2,
        tankId: ID.tankPetrol,
        productId: ID.prodPetrol,
        name: 'DU2-Petrol',
        currentReading: nz(60000),
      },
      {
        id: ID.nzD2,
        organizationId: ID.org,
        stationId: ID.station,
        duId: ID.du2,
        tankId: ID.tankDiesel,
        productId: ID.prodDiesel,
        name: 'DU2-Diesel',
        currentReading: nz(45000),
      },
      {
        id: ID.nzP3,
        organizationId: ID.org,
        stationId: ID.station,
        duId: ID.du3,
        tankId: ID.tankPetrol,
        productId: ID.prodPetrol,
        name: 'DU3-Petrol',
        currentReading: nz(42000),
      },
      {
        id: ID.nzD3,
        organizationId: ID.org,
        stationId: ID.station,
        duId: ID.du3,
        tankId: ID.tankDiesel,
        productId: ID.prodDiesel,
        name: 'DU3-Diesel',
        currentReading: nz(38000),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.paymentTerminals)
    .values([
      {
        id: ID.term1,
        organizationId: ID.org,
        stationId: ID.station,
        label: 'Counter PoS',
        provider: 'HDFC',
        terminalCode: 'TID-1001',
        supportsCard: true,
        supportsUpi: true,
      },
      {
        id: ID.term2,
        organizationId: ID.org,
        stationId: ID.station,
        label: 'Forecourt PoS',
        provider: 'ICICI',
        terminalCode: 'TID-1002',
        supportsCard: true,
        supportsUpi: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.shiftTemplates)
    .values([
      {
        id: ID.tplMorning,
        organizationId: ID.org,
        name: 'Morning',
        startTime: '06:00',
        endTime: '14:00',
        isActive: true,
      },
      {
        id: ID.tplEvening,
        organizationId: ID.org,
        name: 'Evening',
        startTime: '14:00',
        endTime: '22:00',
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.expenseCategories)
    .values([
      { id: ID.catFuelPurchase, organizationId: ID.org, name: 'Fuel Purchase', isSystem: true },
      { id: ID.catUtilities, organizationId: ID.org, name: 'Utilities', isSystem: false },
      { id: ID.catMisc, organizationId: ID.org, name: 'Miscellaneous', isSystem: false },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.suppliers)
    .values([
      {
        id: ID.supplierIoc,
        organizationId: ID.org,
        stationId: ID.station,
        name: 'Indian Oil Corp',
        phone: '+91 00000 00301',
        isActive: true,
      },
      {
        id: ID.supplierLube,
        organizationId: ID.org,
        stationId: ID.station,
        name: 'Servo Distributors',
        phone: '+91 00000 00302',
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.customers)
    .values([
      {
        id: ID.custRegular,
        organizationId: ID.org,
        stationId: ID.station,
        customerType: 'Regular',
        name: 'Walk-in Regular',
        isActive: true,
      },
      {
        id: ID.custCredit,
        organizationId: ID.org,
        stationId: ID.station,
        customerType: 'Credit',
        name: 'Ravi Transport',
        phone: '+91 70000 00001',
        creditLimit: nz(100000),
        isActive: true,
      },
      {
        id: ID.custFleet,
        organizationId: ID.org,
        stationId: ID.station,
        customerType: 'Fleet',
        name: 'City Logistics Fleet',
        fleetCode: 'FLT-001',
        creditLimit: nz(500000),
        isActive: true,
      },
      ...[
        [ID.custKsrtc, 'KSRTC Depot Aluva', '+91 00000 00201', 100000],
        [ID.custMalabar, 'Malabar Transports', '+91 00000 00202', 200000],
        [ID.custPeriyar, 'Periyar Logistics', '+91 00000 00203', 150000],
        [ID.custCoastal, 'Coastal Carriers', '+91 00000 00204', 125000],
        [ID.custGreenline, 'Greenline Tours', '+91 00000 00205', 90000],
        [ID.custMetro, 'Metro Freight', '+91 00000 00206', 175000],
      ].map(([id, name, phone, creditLimit]) => ({
        id,
        organizationId: ID.org,
        stationId: ID.station,
        customerType: 'Credit',
        name,
        phone,
        creditLimit: nz(creditLimit),
        isActive: true,
      })),
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.customerVehicles)
    .values([
      {
        id: ID.vehFleet1,
        organizationId: ID.org,
        customerId: ID.custFleet,
        registrationNumber: 'KA01AB1234',
        vehicleType: 'Truck',
        defaultProductId: ID.prodDiesel,
        isActive: true,
      },
      {
        id: ID.vehFleet2,
        organizationId: ID.org,
        customerId: ID.custFleet,
        registrationNumber: 'KA01AB5678',
        vehicleType: 'Truck',
        defaultProductId: ID.prodDiesel,
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.fuelPrices)
    .values([
      { organizationId: ID.org, stationId: ID.station, productId: ID.prodPetrol, price: nz(102.5) },
      { organizationId: ID.org, stationId: ID.station, productId: ID.prodDiesel, price: nz(89.7) },
      { organizationId: ID.org, stationId: ID.station, productId: ID.prodCng, price: nz(76.0) },
    ])
    .onConflictDoNothing();

  // ---- One business day with two shifts ----
  await db
    .insert(schema.businessDays)
    .values({
      id: ID.bday,
      organizationId: ID.org,
      stationId: ID.station,
      businessDate,
      status: 'OPEN',
      openedBy: ID.userManager,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.shifts)
    .values([
      {
        id: ID.shiftMorning,
        organizationId: ID.org,
        stationId: ID.station,
        businessDayId: ID.bday,
        shiftTemplateId: ID.tplMorning,
        status: 'CLOSED',
        openedBy: ID.userStaff,
        closedBy: ID.userManager,
        closedAt: new Date(),
        closingCash: nz(18650),
      },
      {
        id: ID.shiftEvening,
        organizationId: ID.org,
        stationId: ID.station,
        businessDayId: ID.bday,
        shiftTemplateId: ID.tplEvening,
        status: 'OPEN',
        openedBy: ID.userStaff,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.shiftStaffAssignments)
    .values([
      { shiftId: ID.shiftMorning, userId: ID.userStaff, duId: ID.du2, openingFloat: nz(5000) },
      { shiftId: ID.shiftMorning, userId: ID.attendantRavi, duId: ID.du1, openingFloat: nz(5000) },
      { shiftId: ID.shiftEvening, userId: ID.attendantRavi, duId: ID.du1, openingFloat: nz(5000) },
      { shiftId: ID.shiftEvening, userId: ID.attendantMeera, duId: ID.du2, openingFloat: nz(5000) },
      { shiftId: ID.shiftEvening, userId: ID.attendantJomon, duId: ID.du3, openingFloat: nz(5000) },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.shiftTerminalLinks)
    .values([
      { shiftId: ID.shiftMorning, terminalId: ID.term1, duId: ID.du1 },
      { shiftId: ID.shiftMorning, terminalId: ID.term2, duId: ID.du2 },
    ])
    .onConflictDoNothing();

  // Fuel readings (morning shift): volume = closing - opening
  await db
    .insert(schema.nozzleReadings)
    .values([
      {
        shiftId: ID.shiftMorning,
        nozzleId: ID.nzP1,
        openingReading: nz(125000),
        closingReading: nz(125600),
        volumeSold: nz(600),
        unitPrice: nz(102.5),
      },
      {
        shiftId: ID.shiftMorning,
        nozzleId: ID.nzD1,
        openingReading: nz(98000),
        closingReading: nz(98400),
        volumeSold: nz(400),
        unitPrice: nz(89.7),
      },
    ])
    .onConflictDoNothing();

  // Merchandise sale (POS capture) — 2x engine oil
  await db
    .insert(schema.sales)
    .values({
      id: ID.saleOil,
      documentNumber: 'SAL-000001',
      shiftId: ID.shiftMorning,
      businessDayId: ID.bday,
      saleType: 'Product',
      captureMechanism: 'POS',
      subtotalAmount: nz(900),
      taxAmount: nz(162),
      totalAmount: nz(1062),
    })
    .onConflictDoNothing();
  await db
    .insert(schema.saleItems)
    .values({
      id: ID.saleItemOil,
      saleId: ID.saleOil,
      productId: ID.prodOil,
      quantity: nz(2),
      unitPrice: nz(450),
      discountAmount: nz(0),
      taxAmount: nz(162),
      lineTotal: nz(1062),
    })
    .onConflictDoNothing();

  // Office money accounts (ADR 0005): every office record names one.
  await db
    .insert(schema.financialAccounts)
    .values([
      {
        id: ID.accCash,
        organizationId: ID.org,
        stationId: ID.station,
        accountType: 'CASH_IN_HAND',
        name: 'Cash in Hand',
      },
      {
        id: ID.accPetty,
        organizationId: ID.org,
        stationId: ID.station,
        accountType: 'PETTY_CASH',
        name: 'Petty Cash',
      },
      {
        id: ID.accBank,
        organizationId: ID.org,
        stationId: ID.station,
        accountType: 'BANK',
        name: 'Bank',
      },
    ])
    .onConflictDoNothing();

  // Expenses are Office Records on an Entry Date: petty cash (tea) + bank (electricity)
  const office = { organizationId: ID.org, stationId: ID.station, entryDate: businessDate };
  await db.insert(schema.supplierTransactions).values({
    id: '36500000-0000-4000-8000-000000001801',
    ...office,
    supplierId: ID.supplierIoc,
    transactionType: 'Payment',
    amount: nz(25000),
    fundingAccountId: ID.accBank,
    affectsDrawer: false,
    notes: 'Bank payment against previous fuel invoice',
  }).onConflictDoNothing();
  await db
    .insert(schema.expenses)
    .values([
      {
        id: ID.expDrawer,
        ...office,
        fundingAccountId: ID.accPetty,
        categoryId: ID.catMisc,
        amount: nz(350),
        affectsDrawer: false,
        description: 'Tea & snacks',
        status: 'ACTIVE',
      },
      {
        id: ID.expBank,
        ...office,
        fundingAccountId: ID.accBank,
        categoryId: ID.catUtilities,
        amount: nz(12000),
        affectsDrawer: false,
        description: 'Electricity bill',
        status: 'ACTIVE',
      },
    ])
    .onConflictDoNothing();

  // Fuel delivery purchase — business-day anchored, NO shift
  await db
    .insert(schema.purchases)
    .values({
      id: ID.purchaseFuel,
      documentNumber: 'PUR-000001',
      shiftId: null,
      businessDayId: ID.bday,
      supplierId: ID.supplierIoc,
      invoiceNumber: 'IOC-99812',
      amount: nz(900000),
      notes: 'Diesel tanker 10000L',
    })
    .onConflictDoNothing();

  // Credit sale + a cash collection against credit
  await db
    .insert(schema.customerTransactions)
    .values({
      id: ID.creditTxn,
      shiftId: ID.shiftMorning,
      businessDayId: ID.bday,
      customerId: ID.custCredit,
      productId: ID.prodDiesel,
      transactionType: 'Credit Sale',
      amount: nz(8970),
      quantity: nz(100),
      unitPrice: nz(89.7),
      notes: 'Credit fuel sale',
    })
    .onConflictDoNothing();
  await db.insert(schema.customerTransactions).values({
    id: '36500000-0000-4000-8000-000000001703',
    shiftId: ID.shiftMorning,
    businessDayId: ID.bday,
    customerId: ID.custMalabar,
    productId: ID.prodDiesel,
    attendantId: ID.attendantRavi,
    duId: ID.du1,
    transactionType: 'Credit Sale',
    amount: nz(60000),
    quantity: nz(669),
    unitPrice: nz(89.7),
    notes: 'Fleet credit sale; collection recorded separately',
  }).onConflictDoNothing();
  await db.insert(schema.customerTransactions).values({
    id: '36500000-0000-4000-8000-000000001701',
    shiftId: ID.shiftMorning,
    businessDayId: ID.bday,
    customerId: ID.custKsrtc,
    productId: ID.prodDiesel,
    attendantId: ID.userStaff,
    duId: ID.du2,
    transactionType: 'Credit Sale',
    amount: nz(94000),
    quantity: nz(1048),
    unitPrice: nz(89.7),
    notes: 'Fleet credit sale near the agreed limit',
  }).onConflictDoNothing();
  await db
    .insert(schema.collections)
    .values({
      id: ID.collection1,
      documentNumber: 'COL-000001',
      ...office,
      fundingAccountId: ID.accBank,
      customerId: ID.custCredit,
      amount: nz(15000),
      paymentMethod: 'Bank Transfer',
      notes: 'Bank collection',
    })
    .onConflictDoNothing();
  await db.insert(schema.collections).values({
    id: '36500000-0000-4000-8000-000000001702',
    documentNumber: 'COL-000002',
    ...office,
    fundingAccountId: ID.accBank,
    customerId: ID.custMalabar,
    amount: nz(15000),
    paymentMethod: 'Bank Transfer',
    notes: 'Bank collection against fleet balance',
  }).onConflictDoNothing();

  // Stock movements: purchase (day-anchored, no shift) + fuel sale (shift)
  await db
    .insert(schema.stockMovements)
    .values([
      {
        id: ID.mvPurchase,
        shiftId: null,
        businessDayId: ID.bday,
        productId: ID.prodDiesel,
        tankId: ID.tankDiesel,
        movementType: 'Purchase',
        quantity: nz(10000),
        referenceType: 'purchase',
        referenceId: ID.purchaseFuel,
        notes: 'Tanker decant',
      },
      {
        id: ID.mvSalePetrol,
        shiftId: ID.shiftMorning,
        businessDayId: ID.bday,
        productId: ID.prodPetrol,
        tankId: ID.tankPetrol,
        movementType: 'Sale',
        quantity: nz(-600),
        referenceType: 'reading',
        referenceId: ID.nzP1,
        notes: 'Metered sale',
      },
    ])
    .onConflictDoNothing();

  await db.insert(schema.attendantHandovers).values({
    id: '36500000-0000-4000-8000-000000001501',
    organizationId: ID.org,
    stationId: ID.station,
    shiftId: ID.shiftMorning,
    userId: ID.userStaff,
    duId: ID.du2,
    cashHandedOver: nz(7650),
    openingFloat: nz(5000),
    expectedCash: nz(8000),
    varianceAmount: nz(-350),
    expectedSales: nz(3000),
  }).onConflictDoNothing();
  await db.insert(schema.attendantHandovers).values({
    id: '36500000-0000-4000-8000-000000001505',
    organizationId: ID.org,
    stationId: ID.station,
    shiftId: ID.shiftMorning,
    userId: ID.attendantRavi,
    duId: ID.du1,
    cashHandedOver: nz(8000),
    openingFloat: nz(5000),
    expectedCash: nz(8000),
    varianceAmount: nz(0),
    expectedSales: nz(3000),
  }).onConflictDoNothing();

  await db.insert(schema.stockVariances).values({
    id: '36500000-0000-4000-8000-000000001502',
    businessDayId: ID.bday,
    productId: ID.prodDiesel,
    tankId: ID.tankDiesel,
    expectedQuantity: nz(8200),
    actualQuantity: nz(8182),
    varianceQuantity: nz(-18),
    reason: 'Measured dip is 18 L below book stock; meter and dip cross-check required.',
    approvedBy: ID.userManager,
  }).onConflictDoNothing();

  await db.insert(schema.shiftSummaries).values({
    id: '36500000-0000-4000-8000-000000001503',
    shiftId: ID.shiftMorning,
    snapshotData: {
      source: 'demo-seed',
      cash: { expectedDrawerCash: 8000, declaredCash: 7650, attendantVariance: -350 },
      variance: { amount: -350, attendant: 'Anitha S', dispenser: 'DU-2' },
    },
  }).onConflictDoNothing();

  const eventRows = [
    ['36500000-0000-4000-8000-000000001601', 'SHIFT_OPENED', 'shift', ID.shiftEvening],
    ['36500000-0000-4000-8000-000000001602', 'SHIFT_CLOSED', 'shift', ID.shiftMorning],
    ['36500000-0000-4000-8000-000000001604', 'EXPENSE_RECORDED', 'expense', ID.expDrawer],
    ['36500000-0000-4000-8000-000000001605', 'PURCHASE_RECORDED', 'purchase', ID.purchaseFuel],
    ['36500000-0000-4000-8000-000000001606', 'SALE_RECORDED', 'customer_transaction', ID.creditTxn],
    ['36500000-0000-4000-8000-000000001607', 'COLLECTION_RECORDED', 'collection', ID.collection1],
  ].map(([eventId, eventType, aggregateType, aggregateId]) => ({
    eventId,
    eventType,
    organizationId: ID.org,
    stationId: ID.station,
    businessDayId: ID.bday,
    aggregateType,
    aggregateId,
    occurredAt: new Date(),
    payload: { source: 'demo-seed', businessDate },
    metadata: { source: 'demo-seed' },
  }));
  await db.insert(schema.events).values(eventRows).onConflictDoNothing();

  await seedClosedHistory();

  // Summary counts
  const counts = {};
  for (const t of [
    'organizations',
    'users',
    'stations',
    'products',
    'tanks',
    'nozzles',
    'paymentTerminals',
    'businessDays',
    'shifts',
    'nozzleReadings',
    'sales',
    'expenses',
    'purchases',
    'collections',
    'stockMovements',
    'events',
  ]) {
    const rows = await db.select().from(schema[t]);
    counts[t] = rows.length;
  }
  console.log('SEED OK', JSON.stringify(counts));
}

function dateOffset(yyyyMmDd, days) {
  const [year, month, day] = yyyyMmDd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function demoUuid(sequence) {
  return `36500000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

async function seedClosedHistory() {
  let sequence = 2000;
  const businessDays = [];
  const shifts = [];
  const assignments = [];
  const handovers = [];
  const readings = [];
  const summaries = [];
  const snapshots = [];
  const historyEvents = [];
  const openingByNozzle = new Map([
    [ID.nzP1, 118000], [ID.nzP2, 56000], [ID.nzD1, 93000], [ID.nzD2, 42000],
    [ID.nzP3, 39000], [ID.nzD3, 35000],
  ]);
  const nozzleSetup = [
    [ID.nzP1, ID.prodPetrol, 102.5], [ID.nzD1, ID.prodDiesel, 89.7],
    [ID.nzP2, ID.prodPetrol, 102.5], [ID.nzD2, ID.prodDiesel, 89.7],
    [ID.nzP3, ID.prodPetrol, 102.5], [ID.nzD3, ID.prodDiesel, 89.7],
  ];
  const assignmentsForDay = [
    [ID.userStaff, ID.du2], [ID.attendantRavi, ID.du1], [ID.attendantJomon, ID.du3],
  ];

  for (let age = 7; age >= 1; age -= 1) {
    const date = dateOffset(businessDate, -age);
    const businessDayId = demoUuid(sequence++);
    businessDays.push({
      id: businessDayId, organizationId: ID.org, stationId: ID.station,
      businessDate: date, status: 'CLOSED', openedBy: ID.userManager,
      closedBy: ID.userManager, closedAt: new Date(),
    });
    const daySales = [];
    for (let part = 0; part < 2; part += 1) {
      const shiftId = demoUuid(sequence++);
      const attendant = assignmentsForDay[part === 0 ? 0 : 1];
      shifts.push({
        id: shiftId, organizationId: ID.org, stationId: ID.station, businessDayId,
        shiftTemplateId: part === 0 ? ID.tplMorning : ID.tplEvening,
        status: 'CLOSED', openedBy: attendant[0], closedBy: ID.userManager,
        closedAt: new Date(), closingCash: nz(18000 + age * 100 + part * 250),
      });
      assignments.push({ shiftId, userId: attendant[0], duId: attendant[1], openingFloat: nz(5000) });
      handovers.push({
        id: demoUuid(sequence++), organizationId: ID.org, stationId: ID.station,
        shiftId, userId: attendant[0], duId: attendant[1],
        cashHandedOver: nz(17800 + age * 100 + part * 250),
        openingFloat: nz(5000), cashDrops: nz(500),
        expectedCash: nz(17800 + age * 100 + part * 250), varianceAmount: nz(0),
        expectedSales: nz(17800 + age * 100 + part * 250),
      });
      const dayVolume = [];
      for (const [nozzleId, productId, unitPrice] of nozzleSetup) {
        const opening = openingByNozzle.get(nozzleId);
        const volume = 120 + age * 7 + part * 40;
        const closing = opening + volume;
        readings.push({ shiftId, nozzleId, openingReading: nz(opening), closingReading: nz(closing), volumeSold: nz(volume), unitPrice: nz(unitPrice) });
        openingByNozzle.set(nozzleId, closing);
        dayVolume.push({ nozzleId, productId, volumeLitres: volume });
      }
      const snapshotId = demoUuid(sequence++);
      summaries.push({
        id: snapshotId, shiftId,
        snapshotData: { source: 'demo-seed', businessDate: date, readings: dayVolume, drawer: { declaredCash: 17800 + age * 100, variance: 0 } },
      });
      daySales.push(...dayVolume);
      historyEvents.push({
        eventId: demoUuid(sequence++), eventType: 'SHIFT_CLOSED', organizationId: ID.org,
        stationId: ID.station, businessDayId, aggregateType: 'shift', aggregateId: shiftId,
        occurredAt: new Date(), payload: { businessDate: date, source: 'demo-seed' }, metadata: { source: 'demo-seed' },
      });
    }
    snapshots.push({
      id: demoUuid(sequence++), organizationId: ID.org, stationId: ID.station,
      businessDate: date,
      snapshotData: { source: 'demo-seed', fuel: { byProduct: daySales }, purchases: { total: 0 }, credit: { total: age === 3 ? 94000 : 8970 } },
    });
    historyEvents.push({
      eventId: demoUuid(sequence++), eventType: 'DSSR_GENERATED', organizationId: ID.org,
      stationId: ID.station, businessDayId, aggregateType: 'business_day', aggregateId: businessDayId,
      occurredAt: new Date(), payload: { businessDate: date, source: 'demo-seed' }, metadata: { source: 'demo-seed' },
    });
  }

  await db.insert(schema.businessDays).values(businessDays).onConflictDoNothing();
  await db.insert(schema.shifts).values(shifts).onConflictDoNothing();
  await db.insert(schema.shiftStaffAssignments).values(assignments).onConflictDoNothing();
  await db.insert(schema.attendantHandovers).values(handovers).onConflictDoNothing();
  await db.insert(schema.nozzleReadings).values(readings).onConflictDoNothing();
  await db.insert(schema.shiftSummaries).values(summaries).onConflictDoNothing();
  await db.insert(schema.dssrSnapshots).values(snapshots).onConflictDoNothing();
  await db.insert(schema.events).values(historyEvents).onConflictDoNothing();
}

async function syncDemoAuthUsers() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authUsers = [
    { id: ID.userOwner, email: 'owner@demo.pumpos.invalid', password: process.env.DEMO_OWNER_PASSWORD, name: 'Asha Owner' },
    { id: ID.userManager, email: 'manager@demo.pumpos.invalid', password: process.env.DEMO_MANAGER_PASSWORD, name: 'Mani Manager' },
    { id: ID.userAccountant, email: 'accountant@demo.pumpos.invalid', password: process.env.DEMO_ACCOUNTANT_PASSWORD, name: 'Anita Accountant' },
    { id: ID.userStaff, email: 'attendant@demo.pumpos.invalid', password: process.env.DEMO_ATTENDANT_PASSWORD, name: 'Anitha S' },
  ];
  if (!supabaseUrl || !serviceKey || authUsers.some((user) => !user.password)) {
    throw new Error('Auth provisioning requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_OWNER_PASSWORD, DEMO_MANAGER_PASSWORD, DEMO_ACCOUNTANT_PASSWORD and DEMO_ATTENDANT_PASSWORD.');
  }

  for (const user of authUsers) {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password, email_confirm: true, user_metadata: { full_name: user.name } }),
    });
    let authUser;
    if (response.ok) {
      authUser = await response.json();
    } else if (response.status === 422 || response.status === 409) {
      const list = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?page=1&per_page=1000`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!list.ok) throw new Error(`Could not find existing demo Auth users: ${list.status}`);
      const body = await list.json();
      authUser = (body.users ?? body).find((candidate) => candidate.email?.toLowerCase() === user.email);
      if (!authUser) throw new Error(`Auth user create failed for ${user.email}: ${response.status}`);
      const update = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users/${authUser.id}`, {
        method: 'PUT',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: user.password, email_confirm: true, user_metadata: { full_name: user.name } }),
      });
      if (!update.ok) throw new Error(`Auth user update failed for ${user.email}: ${update.status}`);
    } else {
      throw new Error(`Auth user create failed for ${user.email}: ${response.status} ${await response.text()}`);
    }
    await db.update(schema.users).set({ authUserId: authUser.id }).where(eq(schema.users.id, user.id));
  }
  console.log('Demo Auth users created/updated and linked to the demo organization.');
}

main()
  .catch((e) => {
    console.error('SEED FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
