/**
 * A2 — Owner provisioning (Phase 1 admin script).
 *
 * Creates a new fuel-station OWNER + their organization without any manual DB
 * edits and without sending email/SMS. It calls the Supabase Auth Admin API to
 * create a verified auth user carrying `signup_intent=owner` metadata; the
 * gated `public.handle_new_user()` trigger (see supabase/migrations/…_rls.sql)
 * then creates the organization + Owner `public.users` row and links
 * `auth_user_id`. The owner logs in immediately with the printed credentials.
 *
 * Usage (from repo root or packages/db):
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SECRET_KEY=sb_secret_xxx \
 *   node packages/db/invite-owner.mjs \
 *     --email owner@example.com --name "Jane Owner" --org "Jane's Fuels" [--password 'Secret123']
 *
 * You can also source apps/api/.dev.vars for the secret:
 *   set -a; . apps/api/.dev.vars; set +a; node packages/db/invite-owner.mjs …
 *
 * If --password is omitted a strong one is generated and printed.
 *
 * Email-invite mode (A3): add `--invite` to send the real (Resend) invite email
 * so the owner sets their OWN password via the /accept-invite page — no password
 * is set or printed. The link destination comes from `--redirect <url>` or the
 * `INVITE_REDIRECT_URL` env var (falls back to the Supabase Site URL):
 *   node packages/db/invite-owner.mjs --invite \
 *     --email owner@example.com --name "Jane Owner" --org "Jane's Fuels" \
 *     --redirect https://console.pumpos.app/accept-invite
 */

const args = parseArgs(process.argv.slice(2));

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  fail('Missing SUPABASE_URL and/or SUPABASE_SECRET_KEY in the environment.');
}

const email = (args.email || '').trim().toLowerCase();
const fullName = (args.name || '').trim();
const orgName = (args.org || '').trim();

// Two modes:
//   default        → admin.createUser with an owner-set password (no email).
//   --invite       → admin.inviteUserByEmail: sends the real (Resend) invite
//                    email so the owner sets their OWN password via the
//                    /accept-invite page. Use this to test the A3 email path.
const inviteMode = args.invite === 'true' || args['email-invite'] === 'true';
const redirectTo = (args.redirect || process.env.INVITE_REDIRECT_URL || '').trim();
const password = inviteMode ? null : ((args.password || '').trim() || generatePassword());

if (!email || !fullName || !orgName) {
  fail('Required: --email <email> --name "<full name>" --org "<organization name>"');
}

const ownerMetadata = {
  signup_intent: 'owner',
  organization_name: orgName,
  full_name: fullName,
  role: 'Owner',
};

if (inviteMode) {
  const qs = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite${qs}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, data: ownerMetadata }),
  });
  const inviteText = await inviteRes.text();
  const inviteBody = inviteText ? safeJson(inviteText) : null;
  if (!inviteRes.ok) {
    const msg = (inviteBody && (inviteBody.msg || inviteBody.message)) || `HTTP ${inviteRes.status}`;
    if (inviteRes.status === 422) {
      fail(`Auth user already exists for ${email} (${msg}). Use a different email or delete the existing auth user first.`);
    }
    fail(`Failed to send owner invite: ${msg}`);
  }
  console.log('\n✅ Owner invite sent.');
  console.log('   The gated trigger created the organization + Owner profile row.');
  console.log(`   An invite email was sent to ${email} (redirect: ${redirectTo || 'Supabase Site URL'}).`);
  console.log('   The owner opens it (desktop or mobile), sets a password, then lands in the console.\n');
  process.exit(0);
}

const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    // Read by the gated handle_new_user() trigger to create org + Owner row.
    user_metadata: ownerMetadata,
  }),
});

const text = await res.text();
const body = text ? safeJson(text) : null;

if (!res.ok) {
  const msg = (body && (body.msg || body.message)) || `HTTP ${res.status}`;
  if (res.status === 422) {
    fail(`Auth user already exists for ${email} (${msg}). Use a different email or delete the existing auth user first.`);
  }
  fail(`Failed to create owner auth user: ${msg}`);
}

const authUserId = body && body.id;

console.log('\n✅ Owner provisioned.');
console.log('   The gated trigger created the organization + Owner profile row.');
console.log('   Hand these credentials to the owner (shown once):\n');
console.log(`   Organization : ${orgName}`);
console.log(`   Name         : ${fullName}`);
console.log(`   Login (email): ${email}`);
console.log(`   Password     : ${password}`);
console.log(`   Auth user id : ${authUserId ?? '(unknown)'}\n`);
console.log('   Next: the owner signs in to the web console and completes the onboarding wizard.\n');

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
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

function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  let out = pick(upper) + pick(lower) + pick(digits);
  for (let i = 0; i < 9; i++) out += pick(all);
  return out.split('').sort(() => Math.random() - 0.5).join('');
}

function safeJson(t) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
