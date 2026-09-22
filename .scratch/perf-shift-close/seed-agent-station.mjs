/**
 * One-off infrastructure seed for the Agent Test Station (Mumbai project).
 * Mirrors the old preview station shape: 2 DUs, 4 nozzles, 2 tanks, MS+HSD,
 * lubricant, prices, 2 POS terminals, shift templates, accounts, staff,
 * customer, supplier, expense categories.
 *
 * Idempotent-ish: aborts if the station already has dispenser units.
 * Run: NEWURL=<session-pooler-url> node .scratch/perf-shift-close/seed-agent-station.mjs
 */
import postgres from 'postgres';

const sql = postgres(process.env.NEWURL, { ssl: 'require', max: 1 });
const STATION = 'c7361199-ffe8-432c-96bd-9f99f34511ea';

const [st] = await sql`select id, organization_id as org from stations where id = ${STATION}`;
if (!st) throw new Error('station not found');
const org = st.org;

const existing = await sql`select count(*)::int as n from dispenser_units where station_id = ${STATION}`;
if (existing[0].n > 0) {
  console.log('station already has DUs — aborting to stay idempotent');
  process.exit(0);
}

await sql.begin(async (tx) => {
  // Products
  const [ms] = await tx`insert into products (organization_id, name, code, product_type, inventory_type, stock_tracked, is_taxable, unit, is_active)
    values (${org}, 'Petrol (MS)', 'MS', 'FUEL', 'BULK', true, false, 'Liters', true) returning id`;
  const [hsd] = await tx`insert into products (organization_id, name, code, product_type, inventory_type, stock_tracked, is_taxable, unit, is_active)
    values (${org}, 'Diesel (HSD)', 'HSD', 'FUEL', 'BULK', true, false, 'Liters', true) returning id`;
  const [oil] = await tx`insert into products (organization_id, name, code, product_type, inventory_type, stock_tracked, is_taxable, unit, is_active)
    values (${org}, 'Engine Oil 1L', 'OIL1L', 'LUBRICANT', 'ITEM', true, true, 'Piece', true) returning id`;

  // Tanks
  const [t1] = await tx`insert into tanks (organization_id, station_id, name, product_id, capacity)
    values (${org}, ${STATION}, 'T1 (MS)', ${ms.id}, '15000') returning id`;
  const [t2] = await tx`insert into tanks (organization_id, station_id, name, product_id, capacity)
    values (${org}, ${STATION}, 'T2 (HSD)', ${hsd.id}, '20000') returning id`;

  // Dispenser units
  const [du1] = await tx`insert into dispenser_units (organization_id, station_id, name, code, status)
    values (${org}, ${STATION}, 'Dispenser DU-1', 'DU-1', 'ACTIVE') returning id`;
  const [du2] = await tx`insert into dispenser_units (organization_id, station_id, name, code, status)
    values (${org}, ${STATION}, 'Dispenser DU-2', 'DU-2', 'ACTIVE') returning id`;

  // Nozzles (N1/N2 on DU-1, N3/N4 on DU-2)
  const noz = [
    ['N1', du1.id, t1.id, ms.id, '148871.000'],
    ['N2', du1.id, t2.id, hsd.id, '237305.200'],
    ['N3', du2.id, t1.id, ms.id, '89735.000'],
    ['N4', du2.id, t2.id, hsd.id, '155320.000'],
  ];
  for (const [name, du, tank, prod, reading] of noz) {
    await tx`insert into nozzles (organization_id, station_id, du_id, tank_id, product_id, name, current_reading)
      values (${org}, ${STATION}, ${du}, ${tank}, ${prod}, ${name}, ${reading})`;
  }

  // Fuel prices
  await tx`insert into fuel_prices (organization_id, station_id, product_id, price, effective_from)
    values (${org}, ${STATION}, ${ms.id}, '105.72', now()), (${org}, ${STATION}, ${hsd.id}, '94.34', now())`;

  // Financial accounts (station defaults)
  await tx`insert into financial_accounts (organization_id, station_id, account_type, name, opening_balance, is_active)
    values (${org}, ${STATION}, 'CASH_IN_HAND', 'Cash in Hand', '0', true),
           (${org}, ${STATION}, 'BANK', 'Bank Account', '0', true)`;

  // POS terminals
  await tx`insert into payment_terminals (organization_id, station_id, label, provider, terminal_code, supports_card, supports_upi, is_active)
    values (${org}, ${STATION}, 'HDFC Bank POS 1', 'HDFC Bank', 'TID-001', true, true, true),
           (${org}, ${STATION}, 'HDFC Bank POS 2', 'HDFC Bank', 'TID-002', true, true, true)`;

  // Shift templates
  await tx`insert into shift_templates (organization_id, name, start_time, end_time, is_active)
    values (${org}, 'Day Shift', '06:00', '18:00', true), (${org}, 'Night Shift', '18:00', '06:00', true)`;

  // Staff (no auth accounts; assignable to shifts/DUs)
  await tx`insert into users (organization_id, full_name, email, role, status)
    values (${org}, 'Rashid Kunhali', 'rashid@test.in', 'Attendant', 'ACTIVE'),
           (${org}, 'Divya Menon', 'divya@test.in', 'Attendant', 'ACTIVE'),
           (${org}, 'Sanjay Kumar', 'sanjay@test.in', 'Staff', 'ACTIVE')`;

  // Customer + supplier
  await tx`insert into customers (organization_id, station_id, customer_type, name, phone, credit_limit, is_active)
    values (${org}, ${STATION}, 'Fleet', 'Malabar Roadways', '9999900001', '200000', true),
           (${org}, ${STATION}, 'Credit', 'City Autos', '9999900002', '50000', true)`;
  await tx`insert into suppliers (organization_id, station_id, name, phone, is_active)
    values (${org}, ${STATION}, 'IOCL Kozhikode Terminal', '9999900010', true)`;

  // Expense categories
  await tx`insert into expense_categories (organization_id, name)
    values (${org}, 'Electricity'), (${org}, 'Staff Welfare'), (${org}, 'Maintenance'), (${org}, 'Miscellaneous')
    on conflict do nothing`;

  // NOTE: no opening stock movement here — stock_movements requires a
  // business_day_id, which only exists once the first shift opens. Record a
  // purchase in-app to give the lubricant stock.
});

const counts = await sql`select
  (select count(*) from dispenser_units where station_id = ${STATION}) as dus,
  (select count(*) from nozzles where station_id = ${STATION}) as nozzles,
  (select count(*) from tanks where station_id = ${STATION}) as tanks,
  (select count(*) from payment_terminals where station_id = ${STATION}) as pos,
  (select count(*) from shift_templates where organization_id = ${org}) as templates,
  (select count(*) from users where organization_id = ${org}) as users`;
console.log('seeded:', JSON.stringify(counts[0]));
await sql.end();
