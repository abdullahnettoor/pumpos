/**
 * Platform back-office CLI (Phase A — Option 1).
 *
 * A thin command-line front for the `/platform/*` API routes so a platform
 * admin can invite owners, see who's pending, resend/revoke invites, and
 * deactivate/reactivate an org — without a separate UI. The muscle lives in the
 * API (single choke point); this script only authenticates and calls it.
 *
 * Auth: the CLI signs in as a PLATFORM ADMIN via Supabase's password grant to
 * obtain a short-lived JWT, then presents it as a Bearer token. The email must
 * be in the API's PLATFORM_ADMIN_EMAILS allow-list (the API re-checks it).
 *
 * Config (env or apps/api/.dev.vars):
 *   PUMP_API_URL            base URL of the API worker (e.g. https://api.pumpos.app)
 *                           default: http://localhost:8787
 *   SUPABASE_URL            Supabase project URL (for the password grant)
 *   SUPABASE_ANON_KEY       Supabase anon/publishable key (for the password grant)
 *   PLATFORM_ADMIN_EMAIL    platform-admin login email
 *   PLATFORM_ADMIN_PASSWORD platform-admin login password (prefer prompting)
 *
 * Usage (from repo root):
 *   node packages/db/platform.mjs owners list
 *   node packages/db/platform.mjs owners invite --email o@x.com --name "Jane" --org "Jane Fuels"
 *   node packages/db/platform.mjs owners invite --no-email [--password 'Secret123'] \
 *                                               --email o@x.com --name "Jane" --org "Jane Fuels"
 *   node packages/db/platform.mjs owners resend      --org-id <uuid>
 *   node packages/db/platform.mjs owners revoke      --org-id <uuid>
 *   node packages/db/platform.mjs owners deactivate  --org-id <uuid>
 *   node packages/db/platform.mjs owners reactivate  --org-id <uuid>
 *
 * Tip: source the API secrets first:
 *   set -a; . apps/api/.dev.vars; set +a; node packages/db/platform.mjs owners list
 */

const argv = process.argv.slice(2);
const [group, action, ...rest] = argv;
const flags = parseArgs(rest);

const API_URL = (process.env.PUMP_API_URL || 'http://localhost:8787').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const ADMIN_EMAIL = (process.env.PLATFORM_ADMIN_EMAIL || flags.email || '').trim();
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || '';

if (group !== 'owners') {
  usage();
  process.exit(group ? 1 : 0);
}

const token = await signIn();

switch (action) {
  case 'list':
    await ownersList();
    break;
  case 'invite':
    await ownersInvite();
    break;
  case 'resend':
    await rowAction('resend');
    break;
  case 'revoke':
    await rowAction('revoke');
    break;
  case 'deactivate':
    await rowAction('deactivate');
    break;
  case 'reactivate':
    await rowAction('reactivate');
    break;
  default:
    usage();
    process.exit(1);
}

// ---------------------------------------------------------------------------

async function signIn() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail('Missing SUPABASE_URL and/or SUPABASE_ANON_KEY (needed to authenticate).');
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    fail('Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (a platform-admin login).');
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) {
    fail(`Platform-admin sign-in failed: ${body?.error_description || body?.msg || `HTTP ${res.status}`}`);
  }
  return body.access_token;
}

async function api(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    fail(`${method} ${path} → ${json?.error?.code || res.status}: ${json?.error?.message || 'request failed'}`);
  }
  return json.data;
}

async function ownersList() {
  const rows = await api('GET', '/platform/owners');
  if (!rows.length) {
    console.log('\n(no organizations yet)\n');
    return;
  }
  console.log('');
  for (const r of rows) {
    const o = r.owner;
    const status = o ? o.status : 'no-owner';
    const stations = `${r.readyStationCount}/${r.stationCount} ready`;
    console.log(`• ${r.organizationName}  [${status}]  ${stations}`);
    console.log(`    org-id : ${r.organizationId}`);
    if (o) {
      console.log(`    owner  : ${o.fullName || '(no name)'} <${o.email || 'no-email'}>`);
      if (o.lastSignInAt) console.log(`    last-in: ${o.lastSignInAt}`);
    }
  }
  console.log('');
}

async function ownersInvite() {
  const email = (flags.email || '').trim().toLowerCase();
  const fullName = (flags.name || '').trim();
  const organizationName = (flags.org || '').trim();
  if (!email || !fullName || !organizationName) {
    fail('owners invite requires --email <email> --name "<full name>" --org "<organization>"');
  }
  // No-SMTP fallback: --no-email (optionally with --password) provisions a
  // verified account and prints the credentials to hand over. Otherwise the
  // owner receives a Resend invite and sets their own password.
  const noEmail = flags['no-email'] === 'true' || typeof flags.password === 'string';
  const payload = { email, fullName, organizationName };
  if (noEmail) {
    payload.mode = 'password';
    if (typeof flags.password === 'string' && flags.password !== 'true') payload.password = flags.password;
  }
  const data = await api('POST', '/platform/owners/invite', payload);
  if (data.password) {
    console.log('\n✅ Owner provisioned (no email). Hand these over (shown once):\n');
    console.log(`   Organization : ${organizationName}`);
    console.log(`   Name         : ${fullName}`);
    console.log(`   Login (email): ${data.email}`);
    console.log(`   Password     : ${data.password}`);
    console.log(`   Auth user id : ${data.authUserId}\n`);
  } else {
    console.log(`\n✅ Invite sent to ${data.email} (auth id ${data.authUserId}).`);
    console.log('   The owner sets their own password via the /accept-invite link.\n');
  }
}

async function rowAction(verb) {
  const orgId = (flags['org-id'] || '').trim();
  if (!orgId) fail(`owners ${verb} requires --org-id <uuid>`);
  const data = await api('POST', `/platform/owners/${orgId}/${verb}`, {});
  console.log(`\n✅ ${verb} → ${JSON.stringify(data)}\n`);
}

function parseArgs(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = list[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = 'true';
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

function usage() {
  console.log(`
Platform back-office CLI

  node packages/db/platform.mjs owners list
  node packages/db/platform.mjs owners invite --email <e> --name "<n>" --org "<o>"
  node packages/db/platform.mjs owners invite --no-email [--password <pw>] --email <e> --name "<n>" --org "<o>"
  node packages/db/platform.mjs owners resend      --org-id <uuid>
  node packages/db/platform.mjs owners revoke      --org-id <uuid>
  node packages/db/platform.mjs owners deactivate  --org-id <uuid>
  node packages/db/platform.mjs owners reactivate  --org-id <uuid>

Env: PUMP_API_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
     PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD
`);
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
