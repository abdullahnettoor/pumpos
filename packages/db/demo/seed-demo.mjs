/**
 * Safely reset the private demo organization, then run the schema-shaped seed.
 * Required environment: DATABASE_URL, DEMO_ALLOWED_PROJECT_REF, DEMO_ORG_ID.
 * Optional: PROD_PROJECT_REF, DIRECT_DATABASE_URL.
 */
import postgres from 'postgres';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fail = (message) => {
  console.error(`Demo reset refused: ${message}`);
  process.exit(1);
};

const databaseUrl = process.env.DATABASE_URL;
const allowedRef = process.env.DEMO_ALLOWED_PROJECT_REF?.trim();
const demoOrgId = process.env.DEMO_ORG_ID?.trim();
const prodRef = process.env.PROD_PROJECT_REF?.trim();
if (!databaseUrl) fail('DATABASE_URL is required.');
if (!allowedRef) fail('DEMO_ALLOWED_PROJECT_REF is required.');
if (!prodRef) fail('PROD_PROJECT_REF is required for the production denylist.');
if (!demoOrgId || !/^[0-9a-f-]{36}$/i.test(demoOrgId)) {
  fail('DEMO_ORG_ID must be a UUID.');
}

let url;
try {
  url = new URL(databaseUrl);
} catch {
  fail('DATABASE_URL is not a valid URL.');
}

const hostRef = /^(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|net)$/i.exec(url.hostname)?.[1];
const userRef = /(?:^|\.)([a-z0-9]{20})$/.exec(decodeURIComponent(url.username))?.[1];
const projectRef = hostRef ?? userRef ?? (url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? 'local' : null);
if (!projectRef) {
  fail('could not identify a Supabase project ref from the DATABASE_URL host or pooler username.');
}
if (projectRef === prodRef) fail('DATABASE_URL points at PROD_PROJECT_REF.');
if (projectRef !== allowedRef) {
  fail(`project ref ${projectRef} does not match DEMO_ALLOWED_PROJECT_REF.`);
}

const directUrl = process.env.DIRECT_DATABASE_URL?.trim();
if (directUrl) {
  let directProjectRef;
  try {
    const direct = new URL(directUrl);
    directProjectRef = /^(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|net)$/i.exec(direct.hostname)?.[1]
      ?? /(?:^|\.)([a-z0-9]{20})$/.exec(decodeURIComponent(direct.username))?.[1];
  } catch {
    fail('DIRECT_DATABASE_URL is not a valid URL.');
  }
  if (directProjectRef !== allowedRef || directProjectRef === prodRef) {
    fail('DIRECT_DATABASE_URL must point to the allowlisted non-production Supabase project.');
  }
}

const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
try {
  await sql.begin(async (tx) => {
    // Rows without organization_id are removed via their demo-owned parent.
    await tx`DELETE FROM handover_terminal_entries WHERE handover_id IN (
      SELECT id FROM attendant_handovers WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM shift_summaries WHERE shift_id IN (
      SELECT id FROM shifts WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM nozzle_readings WHERE shift_id IN (
      SELECT id FROM shifts WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM shift_staff_assignments WHERE shift_id IN (
      SELECT id FROM shifts WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM shift_terminal_links WHERE shift_id IN (
      SELECT id FROM shifts WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM user_station_assignments WHERE station_id IN (
      SELECT id FROM stations WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM attendant_handovers WHERE organization_id = ${demoOrgId}::uuid`;
    await tx`DELETE FROM invoices WHERE sale_id IN (
      SELECT id FROM sales WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM nozzle_readings WHERE nozzle_id IN (
      SELECT n.id FROM nozzles n JOIN stations s ON s.id = n.station_id
      WHERE s.organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM stock_variances WHERE business_day_id IN (
      SELECT id FROM business_days WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM stock_movements WHERE business_day_id IN (
      SELECT id FROM business_days WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM purchases WHERE business_day_id IN (
      SELECT id FROM business_days WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM sale_items WHERE sale_id IN (
      SELECT id FROM sales WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM purchase_items WHERE purchase_id IN (
      SELECT id FROM purchases WHERE business_day_id IN (
        SELECT id FROM business_days WHERE organization_id = ${demoOrgId}::uuid
      )
    )`;
    await tx`DELETE FROM ledger_entries WHERE organization_id = ${demoOrgId}::uuid`;
    await tx`DELETE FROM customer_transactions WHERE business_day_id IN (
      SELECT id FROM business_days WHERE organization_id = ${demoOrgId}::uuid
    ) OR shift_id IN (SELECT id FROM shifts WHERE organization_id = ${demoOrgId}::uuid)`;
    await tx`DELETE FROM customer_vehicles WHERE customer_id IN (
      SELECT id FROM customers WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM customer_discount_rules WHERE customer_id IN (
      SELECT id FROM customers WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM supplier_transactions WHERE supplier_id IN (
      SELECT id FROM suppliers WHERE organization_id = ${demoOrgId}::uuid
    )`;
    await tx`DELETE FROM sales WHERE shift_id IN (
      SELECT id FROM shifts WHERE organization_id = ${demoOrgId}::uuid
    )`;

    // Delete every other org-owned projection in reverse domain dependency
    // order. This deliberately never truncates a table or scopes by station.
    const tables = [
      'events', 'idempotency_keys', 'dssr_snapshots',
      'ledger_entries', 'collections', 'other_income', 'expenses', 'document_sequences',
      'fuel_prices', 'expense_categories',
      'income_categories', 'financial_accounts', 'payment_terminals', 'nozzles',
      'dispenser_units', 'tanks', 'products', 'customers', 'suppliers',
      'shifts', 'business_days', 'shift_templates', 'user_station_assignments',
      'users', 'stations', 'organization_capability_grants',
      'organization_limit_overrides',
    ];
    for (const table of tables) {
      // Table identifiers come only from this constant allowlist.
      await tx.unsafe(`DELETE FROM public.${table} WHERE organization_id = $1::uuid`, [demoOrgId]);
    }
    await tx`DELETE FROM organizations WHERE id = ${demoOrgId}::uuid`;
  });
} catch (error) {
  console.error('Demo reset failed while deleting demo-owned rows. No seed was run.');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

if (process.exitCode) process.exit(process.exitCode);

const seedPath = fileURLToPath(new URL('../seed.mjs', import.meta.url));
const run = spawnSync(process.execPath, [seedPath], {
  cwd: path.resolve(path.dirname(seedPath), '..'),
  env: { ...process.env, DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL || databaseUrl },
  stdio: 'inherit',
});
if (run.status !== 0) process.exit(run.status ?? 1);

console.log('\nDemo sign-ins (set passwords with the matching DEMO_*_PASSWORD secrets):');
console.log('Owner: owner@demo.pumpos.invalid');
console.log('Manager: manager@demo.pumpos.invalid');
console.log('Accountant: accountant@demo.pumpos.invalid');
console.log('Attendant: attendant@demo.pumpos.invalid');
console.log('Dashboard: https://dev-pumpos-console.abdullahnettoor.workers.dev');
