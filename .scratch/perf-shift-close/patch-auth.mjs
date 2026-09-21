import postgres from 'postgres';
const sql = postgres(process.env.NEWURL, { ssl: 'require', max: 1 });
await sql.unsafe(`UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
  WHERE email = 'agent-owner@test.in'`);
console.log('patched');
await sql.end();
