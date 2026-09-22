import postgres from 'postgres';
const sql = postgres(process.env.NEWURL, { ssl: 'require', max: 1, prepare: false });
const email = 'abdullahnettoor@gmail.com';
const pw = process.env.ADMIN_PW;

const dup = await sql`select id from auth.users where email = ${email}`;
if (dup.length) { console.log('already exists:', dup[0].id); process.exit(0); }

// Plain auth user: NO signup_intent metadata, so handle_new_user() falls
// through without bootstrapping an organization (platform admins are not tenants).
const [u] = await sql`
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    ${email}, crypt(${pw}, gen_salt('bf')), now(),
    ${sql.json({ provider: 'email', providers: ['email'] })},
    ${sql.json({ full_name: 'Abdullah Nettoor' })},
    now(), now(), '', '', '', '', '', '', '', '')
  RETURNING id`;
await sql`
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), ${u.id}, ${u.id}, 'email',
    ${sql.json({ sub: u.id, email, email_verified: true })}, now(), now(), now())`;

const orgCheck = await sql`select count(*)::int as n from users where auth_user_id = ${u.id}`;
console.log('auth user:', u.id, '| tenant rows created (should be 0):', orgCheck[0].n);
await sql.end();
