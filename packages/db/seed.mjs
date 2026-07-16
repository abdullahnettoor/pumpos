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
  org: '00000000-0000-4000-8000-000000000001',
  station: '00000000-0000-4000-8000-000000000010',
  userOwner: '00000000-0000-4000-8000-000000000101',
  userManager: '00000000-0000-4000-8000-000000000102',
  userAccountant: '00000000-0000-4000-8000-000000000103',
  userStaff: '00000000-0000-4000-8000-000000000104',
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
  nzP1: '00000000-0000-4000-8000-000000000501',
  nzP2: '00000000-0000-4000-8000-000000000502',
  nzD1: '00000000-0000-4000-8000-000000000503',
  nzD2: '00000000-0000-4000-8000-000000000504',
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
};

const today = new Date();
const businessDate = today.toISOString().slice(0, 10); // YYYY-MM-DD
const nz = (v) => String(v);

async function main() {
  await db.insert(schema.organizations).values({
    id: ID.org, name: 'Demo Fuels Pvt Ltd', subscriptionPlan: 'Core', subscriptionStatus: 'Active',
  }).onConflictDoNothing();

  await db.insert(schema.users).values([
    { id: ID.userOwner, organizationId: ID.org, fullName: 'Asha Owner', email: 'owner@demo.test', role: 'Owner', status: 'ACTIVE' },
    { id: ID.userManager, organizationId: ID.org, fullName: 'Mani Manager', email: 'manager@demo.test', role: 'Manager', status: 'ACTIVE' },
    { id: ID.userAccountant, organizationId: ID.org, fullName: 'Anita Accountant', email: 'accountant@demo.test', role: 'Accountant', status: 'ACTIVE' },
    { id: ID.userStaff, organizationId: ID.org, fullName: 'Sita Staff', email: 'staff@demo.test', role: 'Staff', status: 'ACTIVE' },
  ]).onConflictDoNothing();

  await db.insert(schema.stations).values({
    id: ID.station, organizationId: ID.org, name: 'Demo Highway Station', code: 'STN-01',
    address: 'NH-44, Demo City', phone: '+91 90000 00000', onboardingStatus: 'COMPLETED', isActive: true,
  }).onConflictDoNothing();

  await db.insert(schema.userStationAssignments).values([
    { userId: ID.userOwner, stationId: ID.station },
    { userId: ID.userManager, stationId: ID.station },
    { userId: ID.userStaff, stationId: ID.station },
  ]).onConflictDoNothing();

  await db.insert(schema.products).values([
    { id: ID.prodPetrol, organizationId: ID.org, name: 'Petrol XP95', code: 'FUEL-PET', productType: 'FUEL', inventoryType: 'BULK', stockTracked: true, isTaxable: false, unit: 'L' },
    { id: ID.prodDiesel, organizationId: ID.org, name: 'Diesel', code: 'FUEL-DSL', productType: 'FUEL', inventoryType: 'BULK', stockTracked: true, isTaxable: false, unit: 'L' },
    { id: ID.prodCng, organizationId: ID.org, name: 'CNG', code: 'FUEL-CNG', productType: 'FUEL', inventoryType: 'BULK', stockTracked: true, isTaxable: false, unit: 'kg' },
    { id: ID.prodOil, organizationId: ID.org, name: 'Servo 20W40 1L', code: 'LUB-2040', productType: 'LUBRICANT', inventoryType: 'ITEM', stockTracked: true, isTaxable: true, unit: 'pc' },
    { id: ID.prodCoolant, organizationId: ID.org, name: 'Coolant 500ml', code: 'LUB-COOL', productType: 'LUBRICANT', inventoryType: 'ITEM', stockTracked: true, isTaxable: true, unit: 'pc' },
    { id: ID.prodWasher, organizationId: ID.org, name: 'Windshield Fluid 1L', code: 'ACC-WSH', productType: 'ACCESSORY', inventoryType: 'ITEM', stockTracked: true, isTaxable: true, unit: 'pc' },
    { id: ID.prodService, organizationId: ID.org, name: 'Air Check Service', code: 'SVC-AIR', productType: 'SERVICE', inventoryType: 'NONE', stockTracked: false, isTaxable: true, unit: 'job' },
  ]).onConflictDoNothing();

  await db.insert(schema.tanks).values([
    { id: ID.tankPetrol, organizationId: ID.org, stationId: ID.station, name: 'Tank A (Petrol)', productId: ID.prodPetrol, capacity: nz(20000) },
    { id: ID.tankDiesel, organizationId: ID.org, stationId: ID.station, name: 'Tank B (Diesel)', productId: ID.prodDiesel, capacity: nz(20000) },
  ]).onConflictDoNothing();

  await db.insert(schema.dispenserUnits).values([
    { id: ID.du1, organizationId: ID.org, stationId: ID.station, name: 'DU-1', code: 'DU1', status: 'ACTIVE' },
    { id: ID.du2, organizationId: ID.org, stationId: ID.station, name: 'DU-2', code: 'DU2', status: 'ACTIVE' },
  ]).onConflictDoNothing();

  await db.insert(schema.nozzles).values([
    { id: ID.nzP1, organizationId: ID.org, stationId: ID.station, duId: ID.du1, tankId: ID.tankPetrol, productId: ID.prodPetrol, name: 'DU1-Petrol', currentReading: nz(125000) },
    { id: ID.nzD1, organizationId: ID.org, stationId: ID.station, duId: ID.du1, tankId: ID.tankDiesel, productId: ID.prodDiesel, name: 'DU1-Diesel', currentReading: nz(98000) },
    { id: ID.nzP2, organizationId: ID.org, stationId: ID.station, duId: ID.du2, tankId: ID.tankPetrol, productId: ID.prodPetrol, name: 'DU2-Petrol', currentReading: nz(60000) },
    { id: ID.nzD2, organizationId: ID.org, stationId: ID.station, duId: ID.du2, tankId: ID.tankDiesel, productId: ID.prodDiesel, name: 'DU2-Diesel', currentReading: nz(45000) },
  ]).onConflictDoNothing();

  await db.insert(schema.paymentTerminals).values([
    { id: ID.term1, organizationId: ID.org, stationId: ID.station, label: 'Counter PoS', provider: 'HDFC', terminalCode: 'TID-1001', supportsCard: true, supportsUpi: true },
    { id: ID.term2, organizationId: ID.org, stationId: ID.station, label: 'Forecourt PoS', provider: 'ICICI', terminalCode: 'TID-1002', supportsCard: true, supportsUpi: true },
  ]).onConflictDoNothing();

  await db.insert(schema.shiftTemplates).values([
    { id: ID.tplMorning, organizationId: ID.org, name: 'Morning', startTime: '06:00', endTime: '14:00', isActive: true },
    { id: ID.tplEvening, organizationId: ID.org, name: 'Evening', startTime: '14:00', endTime: '22:00', isActive: true },
  ]).onConflictDoNothing();

  await db.insert(schema.expenseCategories).values([
    { id: ID.catFuelPurchase, organizationId: ID.org, name: 'Fuel Purchase', isSystem: true },
    { id: ID.catUtilities, organizationId: ID.org, name: 'Utilities', isSystem: false },
    { id: ID.catMisc, organizationId: ID.org, name: 'Miscellaneous', isSystem: false },
  ]).onConflictDoNothing();

  await db.insert(schema.suppliers).values([
    { id: ID.supplierIoc, organizationId: ID.org, stationId: ID.station, name: 'Indian Oil Corp', phone: '+91 80000 00001', isActive: true },
    { id: ID.supplierLube, organizationId: ID.org, stationId: ID.station, name: 'Servo Distributors', phone: '+91 80000 00002', isActive: true },
  ]).onConflictDoNothing();

  await db.insert(schema.customers).values([
    { id: ID.custRegular, organizationId: ID.org, stationId: ID.station, customerType: 'Regular', name: 'Walk-in Regular', isActive: true },
    { id: ID.custCredit, organizationId: ID.org, stationId: ID.station, customerType: 'Credit', name: 'Ravi Transport', phone: '+91 70000 00001', creditLimit: nz(100000), isActive: true },
    { id: ID.custFleet, organizationId: ID.org, stationId: ID.station, customerType: 'Fleet', name: 'City Logistics Fleet', fleetCode: 'FLT-001', creditLimit: nz(500000), isActive: true },
  ]).onConflictDoNothing();

  await db.insert(schema.customerVehicles).values([
    { id: ID.vehFleet1, organizationId: ID.org, customerId: ID.custFleet, registrationNumber: 'KA01AB1234', vehicleType: 'Truck', defaultProductId: ID.prodDiesel, isActive: true },
    { id: ID.vehFleet2, organizationId: ID.org, customerId: ID.custFleet, registrationNumber: 'KA01AB5678', vehicleType: 'Truck', defaultProductId: ID.prodDiesel, isActive: true },
  ]).onConflictDoNothing();

  await db.insert(schema.fuelPrices).values([
    { organizationId: ID.org, stationId: ID.station, productId: ID.prodPetrol, price: nz(102.5) },
    { organizationId: ID.org, stationId: ID.station, productId: ID.prodDiesel, price: nz(89.7) },
    { organizationId: ID.org, stationId: ID.station, productId: ID.prodCng, price: nz(76.0) },
  ]).onConflictDoNothing();

  // ---- One business day with two shifts ----
  await db.insert(schema.businessDays).values({
    id: ID.bday, organizationId: ID.org, stationId: ID.station, businessDate, status: 'OPEN', openedBy: ID.userManager,
  }).onConflictDoNothing();

  await db.insert(schema.shifts).values([
    { id: ID.shiftMorning, organizationId: ID.org, stationId: ID.station, businessDayId: ID.bday, shiftTemplateId: ID.tplMorning, status: 'CLOSED', openedBy: ID.userStaff, closedBy: ID.userManager, closedAt: new Date(), openingCash: nz(5000), closingCash: nz(18650) },
    { id: ID.shiftEvening, organizationId: ID.org, stationId: ID.station, businessDayId: ID.bday, shiftTemplateId: ID.tplEvening, status: 'OPEN', openedBy: ID.userStaff, openingCash: nz(8000) },
  ]).onConflictDoNothing();

  await db.insert(schema.shiftStaffAssignments).values([
    { shiftId: ID.shiftMorning, userId: ID.userStaff, duId: ID.du1 },
    { shiftId: ID.shiftEvening, userId: ID.userStaff, duId: ID.du1 },
  ]).onConflictDoNothing();

  await db.insert(schema.shiftTerminalLinks).values([
    { shiftId: ID.shiftMorning, terminalId: ID.term1, duId: ID.du1 },
    { shiftId: ID.shiftMorning, terminalId: ID.term2, duId: ID.du2 },
  ]).onConflictDoNothing();

  // Fuel readings (morning shift): volume = closing - opening
  await db.insert(schema.nozzleReadings).values([
    { shiftId: ID.shiftMorning, nozzleId: ID.nzP1, openingReading: nz(125000), closingReading: nz(125600), volumeSold: nz(600), unitPrice: nz(102.5) },
    { shiftId: ID.shiftMorning, nozzleId: ID.nzD1, openingReading: nz(98000), closingReading: nz(98400), volumeSold: nz(400), unitPrice: nz(89.7) },
  ]).onConflictDoNothing();

  // Merchandise sale (POS capture) — 2x engine oil
  await db.insert(schema.sales).values({
    id: ID.saleOil, documentNumber: 'SAL-000001', shiftId: ID.shiftMorning, businessDayId: ID.bday,
    saleType: 'Product', captureMechanism: 'POS', subtotalAmount: nz(900), taxAmount: nz(162), totalAmount: nz(1062),
  }).onConflictDoNothing();
  await db.insert(schema.saleItems).values({
    id: ID.saleItemOil, saleId: ID.saleOil, productId: ID.prodOil, quantity: nz(2), unitPrice: nz(450), discountAmount: nz(0), taxAmount: nz(162), lineTotal: nz(1062),
  }).onConflictDoNothing();

  // Expenses: drawer (tea) + business (electricity via bank)
  await db.insert(schema.expenses).values([
    { id: ID.expDrawer, shiftId: ID.shiftMorning, businessDayId: ID.bday, categoryId: ID.catMisc, amount: nz(350), paidFrom: 'SHIFT_CASH', affectsDrawer: true, description: 'Tea & snacks', status: 'ACTIVE' },
    { id: ID.expBank, shiftId: null, businessDayId: ID.bday, categoryId: ID.catUtilities, amount: nz(12000), paidFrom: 'BANK', affectsDrawer: false, description: 'Electricity bill', status: 'ACTIVE' },
  ]).onConflictDoNothing();

  // Fuel delivery purchase — business-day anchored, NO shift
  await db.insert(schema.purchases).values({
    id: ID.purchaseFuel, documentNumber: 'PUR-000001', shiftId: null, businessDayId: ID.bday, supplierId: ID.supplierIoc, invoiceNumber: 'IOC-99812', amount: nz(900000), notes: 'Diesel tanker 10000L',
  }).onConflictDoNothing();

  // Credit sale + a cash collection against credit
  await db.insert(schema.customerTransactions).values({
    id: ID.creditTxn, shiftId: ID.shiftMorning, businessDayId: ID.bday, customerId: ID.custCredit, productId: ID.prodDiesel,
    transactionType: 'Credit Sale', amount: nz(8970), quantity: nz(100), unitPrice: nz(89.7), notes: 'Credit fuel sale',
  }).onConflictDoNothing();
  await db.insert(schema.collections).values({
    id: ID.collection1, documentNumber: 'COL-000001', shiftId: ID.shiftMorning, businessDayId: ID.bday, customerId: ID.custCredit, amount: nz(5000), paymentMethod: 'Cash', notes: 'Part payment',
  }).onConflictDoNothing();

  // Stock movements: purchase (day-anchored, no shift) + fuel sale (shift)
  await db.insert(schema.stockMovements).values([
    { id: ID.mvPurchase, shiftId: null, businessDayId: ID.bday, productId: ID.prodDiesel, tankId: ID.tankDiesel, movementType: 'Purchase', quantity: nz(10000), referenceType: 'purchase', referenceId: ID.purchaseFuel, notes: 'Tanker decant' },
    { id: ID.mvSalePetrol, shiftId: ID.shiftMorning, businessDayId: ID.bday, productId: ID.prodPetrol, tankId: ID.tankPetrol, movementType: 'Sale', quantity: nz(-600), referenceType: 'reading', referenceId: ID.nzP1, notes: 'Metered sale' },
  ]).onConflictDoNothing();

  // Summary counts
  const counts = {};
  for (const t of ['organizations', 'users', 'stations', 'products', 'tanks', 'nozzles', 'paymentTerminals', 'businessDays', 'shifts', 'nozzleReadings', 'sales', 'expenses', 'purchases', 'collections', 'stockMovements']) {
    const rows = await db.select().from(schema[t]);
    counts[t] = rows.length;
  }
  console.log('SEED OK', JSON.stringify(counts));
}

main()
  .catch((e) => { console.error('SEED FAILED:', e.message); process.exitCode = 1; })
  .finally(async () => { await client.end(); });
