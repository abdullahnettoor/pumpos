import { eq } from 'drizzle-orm';
import { resolveBusinessDate } from '@pump/shared';
import * as schema from '../schema.js';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js/session';
import type { PgTransaction } from 'drizzle-orm/pg-core';

export interface SeedDemoStationOptions {
  organizationId: string;
  ownerUserId: string;
  stationName?: string;
  town?: string;
  tanks?: number;
  nozzles?: number;
  attendants?: number;
  today?: string;
}

const DEFAULTS = {
  stationName: 'Sample Fuels',
  town: 'Thrissur',
  tanks: 2,
  nozzles: 6,
  attendants: 3,
};

/** Provision isolated station master data using generated IDs inside the caller's transaction. */
export async function seedDemoStation(
  tx: PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>,
  input: SeedDemoStationOptions,
) {
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
      {
        organizationId: options.organizationId,
        name: 'Engine Oil',
        code: `DEMO-OIL-${crypto.randomUUID().slice(0, 6)}`,
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
  await tx.insert(schema.financialAccounts).values([
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
    {
      organizationId: options.organizationId,
      stationId: station.id,
      accountType: 'PETTY_CASH',
      name: 'Petty Cash',
    },
  ]);
  await tx.insert(schema.customers).values([
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
    ...['Thrissur Cabs', 'Kerala Logistics', 'City Motors', 'Greenline Tours'].map(
      (name, index) => ({
        organizationId: options.organizationId,
        customerType: 'Credit',
        name,
        phone: `+91 00000 ${String(1010 + index).slice(-5)}`,
        creditLimit: '50000',
      }),
    ),
  ]);
  await tx.insert(schema.suppliers).values([
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
  ]);
  const [expenseCategory] = await tx
    .insert(schema.expenseCategories)
    .values({ organizationId: options.organizationId, name: 'Utilities', isSystem: true })
    .returning();
  const [incomeCategory] = await tx
    .insert(schema.incomeCategories)
    .values({ organizationId: options.organizationId, name: 'Other income', isSystem: true })
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
        currentReading: '0',
        meterSerial: `DEMO-${crypto.randomUUID().slice(0, 8)}`,
      };
    }),
  );
  const daysAgo = (age: number) => {
    const instant = new Date(Date.now() - age * 86_400_000);
    const resolvedToday =
      options.today ??
      resolveBusinessDate({
        now: new Date(),
        timeZone: 'Asia/Kolkata',
        dayStartsAt: '05:00',
      });
    if (age === 0) return resolvedToday;
    const [year, month, day] = resolvedToday.split('-').map(Number);
    const todayAtUtc = new Date(Date.UTC(year, month - 1, day));
    const shifted = new Date(todayAtUtc.getTime() - age * 86_400_000);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
  };
  const nozzles = await tx
    .select()
    .from(schema.nozzles)
    .where(eq(schema.nozzles.organizationId, options.organizationId));
  const historicalDays: Array<{ businessDayId: string; shiftId: string; businessDate: string }> =
    [];
  for (let age = 7; age >= 1; age--) {
    const [closedDay] = await tx
      .insert(schema.businessDays)
      .values({
        organizationId: options.organizationId,
        stationId: station.id,
        businessDate: daysAgo(age),
        status: 'CLOSED',
        openedBy: options.ownerUserId,
        closedBy: options.ownerUserId,
        closedAt: new Date(Date.now() - age * 86_400_000 + 86_400_000),
      })
      .returning();
    const [pastShift] = await tx
      .insert(schema.shifts)
      .values({
        organizationId: options.organizationId,
        stationId: station.id,
        businessDayId: closedDay.id,
        shiftTemplateId: templates.find((template) => template.name === 'Morning')!.id,
        status: 'CLOSED',
        openedBy: options.ownerUserId,
        closedBy: options.ownerUserId,
        closedAt: new Date(Date.now() - age * 86_400_000 + 50_000_000),
      })
      .returning();
    historicalDays.push({
      businessDayId: closedDay.id,
      shiftId: pastShift.id,
      businessDate: closedDay.businessDate,
    });
    await tx.insert(schema.nozzleReadings).values(
      nozzles.map((nozzle, index) => {
        const opening = 100_000 + (7 - age) * (350 + index * 35) + index * 2_000;
        const volume = 350 + index * 35;
        return {
          shiftId: pastShift.id,
          nozzleId: nozzle.id,
          openingReading: String(opening),
          closingReading: String(opening + volume),
          volumeSold: String(volume),
          unitPrice: nozzle.productId === fuels[1].id ? '89.70' : '102.50',
        };
      }),
    );
    await tx.insert(schema.stockMovements).values(
      nozzles.map((nozzle, index) => ({
        businessDayId: closedDay.id,
        productId: nozzle.productId,
        tankId: nozzle.tankId,
        movementType: 'Sale',
        quantity: String(-(350 + index * 35)),
        referenceType: 'demo-seed',
        notes: 'Fuel sale recorded from demo nozzle readings',
      })),
    );
    await tx.insert(schema.shiftSummaries).values({
      shiftId: pastShift.id,
      snapshotData: {
        generatedAt: pastShift.closedAt?.toISOString() ?? new Date().toISOString(),
        businessDate: closedDay.businessDate,
        status: 'CLOSED',
        nozzleReadings: nozzles.map((nozzle) => ({ nozzleId: nozzle.id, volumeSold: 385 })),
        drawer: { declaredCash: 17800, variance: 0 },
        source: 'demo-template',
      },
    });
    await tx.insert(schema.dssrSnapshots).values({
      organizationId: options.organizationId,
      stationId: station.id,
      businessDate: closedDay.businessDate,
      snapshotData: {
        generatedAt: closedDay.closedAt?.toISOString() ?? new Date().toISOString(),
        businessDate: closedDay.businessDate,
        stationId: station.id,
        organizationId: options.organizationId,
        status: 'CLOSED',
        live: false,
        sales: { gross: 50000 + (7 - age) * 1000, fuelVolume: nozzles.length * 385 },
        stock: { expected: 12000, actual: 12000, variance: 0 },
        source: 'demo-template',
      },
    });
    if (age === 3) {
      const [ksrtc] = await tx
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.name, 'KSRTC Depot Aluva'))
        .limit(1);
      await tx.insert(schema.customerTransactions).values({
        shiftId: pastShift.id,
        businessDayId: closedDay.id,
        customerId: ksrtc.id,
        productId: fuels[1].id,
        transactionType: 'Credit Sale',
        amount: '94000',
        quantity: '1048',
        unitPrice: '89.70',
        attendantId: options.ownerUserId,
        notes: 'Fleet credit sale near the agreed limit',
      });
    }
  }
  const [businessDay] = await tx
    .insert(schema.businessDays)
    .values({
      organizationId: options.organizationId,
      stationId: station.id,
      businessDate: daysAgo(0),
      status: 'OPEN',
      openedBy: options.ownerUserId,
    })
    .returning();
  const [bankAccount] = await tx
    .select()
    .from(schema.financialAccounts)
    .where(eq(schema.financialAccounts.organizationId, options.organizationId))
    .limit(1);
  await tx.insert(schema.collections).values({
    documentNumber: `COL-${crypto.randomUUID().slice(0, 8)}`,
    organizationId: options.organizationId,
    stationId: station.id,
    entryDate: daysAgo(0),
    customerId: (
      await tx
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.name, 'Malabar Transports'))
        .limit(1)
    )[0].id,
    amount: '15000',
    paymentMethod: 'Bank Transfer',
    fundingAccountId: bankAccount.id,
    notes: 'Bank collection against Malabar fleet credit',
  });
  await tx.insert(schema.expenses).values({
    organizationId: options.organizationId,
    stationId: station.id,
    entryDate: daysAgo(0),
    categoryId: expenseCategory.id,
    amount: '12000',
    fundingAccountId: bankAccount.id,
    affectsDrawer: false,
    description: 'Electricity bill',
  });
  const [firstSupplier] = await tx
    .select()
    .from(schema.suppliers)
    .where(eq(schema.suppliers.organizationId, options.organizationId))
    .limit(1);
  await tx.insert(schema.supplierTransactions).values({
    organizationId: options.organizationId,
    stationId: station.id,
    entryDate: daysAgo(0),
    supplierId: firstSupplier.id,
    transactionType: 'Payment',
    amount: '25000',
    fundingAccountId: bankAccount.id,
    affectsDrawer: false,
    notes: 'Bank payment against previous lubricant invoice',
  });
  await tx.insert(schema.otherIncome).values({
    organizationId: options.organizationId,
    stationId: station.id,
    entryDate: options.today ?? daysAgo(0),
    categoryId: incomeCategory.id,
    amount: '500',
    fundingAccountId: bankAccount.id,
    affectsDrawer: false,
    description: 'Supplier promotional rebate',
  });
  const [morning] = await tx
    .insert(schema.shifts)
    .values({
      organizationId: options.organizationId,
      stationId: station.id,
      businessDayId: businessDay.id,
      shiftTemplateId: templates.find((template) => template.name === 'Morning')!.id,
      status: 'CLOSED',
      openedBy: options.ownerUserId,
      closedBy: options.ownerUserId,
      closedAt: new Date(),
    })
    .returning();
  await tx.insert(schema.shiftSummaries).values({
    shiftId: morning.id,
    snapshotData: {
      generatedAt: new Date().toISOString(),
      businessDate: businessDay.businessDate,
      status: 'CLOSED',
      nozzleReadings: [],
      drawer: { declaredCash: 0, variance: 0 },
      source: 'demo-template',
    },
  });
  const [evening] = await tx
    .insert(schema.shifts)
    .values({
      organizationId: options.organizationId,
      stationId: station.id,
      businessDayId: businessDay.id,
      shiftTemplateId: templates.find((template) => template.name === 'Evening')!.id,
      status: 'OPEN',
      openedBy: options.ownerUserId,
    })
    .returning();
  let eventOrdinal = 0;
  const appendSeedEvent = async (
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    businessDayId: string,
    occurredAt: Date,
    payload: Record<string, unknown>,
  ) => {
    eventOrdinal += 1;
    await tx.insert(schema.events).values({
      eventId: crypto.randomUUID(),
      eventType,
      organizationId: options.organizationId,
      stationId: station.id,
      businessDayId,
      aggregateType,
      aggregateId,
      occurredAt,
      actorId: options.ownerUserId,
      correlationId: crypto.randomUUID(),
      payload: { ...payload, source: 'demo-template', ordinal: eventOrdinal },
      metadata: {
        grouping: { role: 'primary' },
        source: 'demo-template',
      },
    });
  };
  for (const [index, historical] of historicalDays.entries()) {
    const occurredAt = new Date(Date.now() - (7 - index) * 86_400_000);
    await appendSeedEvent(
      'SHIFT_CLOSED',
      'shift',
      historical.shiftId,
      historical.businessDayId,
      occurredAt,
      { businessDate: historical.businessDate },
    );
    await appendSeedEvent(
      'DSSR_GENERATED',
      'business_day',
      historical.businessDayId,
      historical.businessDayId,
      occurredAt,
      { businessDate: historical.businessDate },
    );
  }
  await appendSeedEvent('SHIFT_OPENED', 'shift', morning.id, businessDay.id, new Date(), {
    businessDate: businessDay.businessDate,
  });
  await appendSeedEvent('SHIFT_CLOSED', 'shift', morning.id, businessDay.id, new Date(), {
    businessDate: businessDay.businessDate,
  });
  await appendSeedEvent('SHIFT_OPENED', 'shift', evening.id, businessDay.id, new Date(), {
    businessDate: businessDay.businessDate,
  });
  await appendSeedEvent(
    'SALE_RECORDED',
    'customer_transaction',
    (
      await tx
        .select()
        .from(schema.customerTransactions)
        .where(eq(schema.customerTransactions.shiftId, evening.id))
        .limit(1)
    )[0].id,
    businessDay.id,
    new Date(),
    { transactionType: 'Credit Sale' },
  );
  const attendantsOnly = people.filter((person) => person.role === 'Attendant');
  await tx.insert(schema.shiftStaffAssignments).values(
    dispensers.map((du, index) => ({
      shiftId: evening.id,
      userId: attendantsOnly[index % attendantsOnly.length].id,
      duId: du.id,
      openingFloat: '5000',
    })),
  );
  const [anitha] = attendantsOnly;
  await tx.insert(schema.attendantHandovers).values({
    organizationId: options.organizationId,
    stationId: station.id,
    shiftId: evening.id,
    userId: anitha.id,
    duId: dispensers[Math.min(1, dispensers.length - 1)].id,
    cashHandedOver: '7650',
    expectedCash: '8000',
    varianceAmount: '-350',
    openingFloat: '5000',
    expectedSales: '3000',
  });
  const hsdTank = tanks.find((tank) => tank.productId === fuels[1].id);
  await tx.insert(schema.stockVariances).values({
    businessDayId: businessDay.id,
    productId: fuels[1].id,
    tankId: hsdTank?.id ?? tanks[0].id,
    expectedQuantity: '12000',
    actualQuantity: '11982',
    varianceQuantity: '-18',
    reason: 'Dip reading differs from expected stock',
    approvedBy: options.ownerUserId,
  });
  const malabarCreditCustomer = (
    await tx
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.name, 'Malabar Transports'))
      .limit(1)
  )[0];
  await tx.insert(schema.customerTransactions).values({
    shiftId: evening.id,
    businessDayId: businessDay.id,
    customerId: malabarCreditCustomer.id,
    productId: fuels[1].id,
    transactionType: 'Credit Sale',
    amount: '60000',
    quantity: '669',
    unitPrice: '89.70',
    attendantId: attendantsOnly[0].id,
    duId: dispensers[1]?.id ?? dispensers[0].id,
    notes: 'Fleet credit sale for Malabar Transports',
  });
  return {
    station,
    owner,
    people,
    tanks,
    dispensers,
    products,
    businessDay,
    eveningShift: evening,
  };
}
