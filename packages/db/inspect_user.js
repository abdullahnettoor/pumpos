import postgres from 'postgres';

const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Missing DIRECT_DATABASE_URL (or DATABASE_URL) for user inspection');
}

const sql = postgres(connectionString, { ssl: 'require' });

async function inspect() {
  try {
    console.log('Querying auth.users on remote database...');
    const users = await sql`
      SELECT id, email, confirmed_at, last_sign_in_at, email_confirmed_at, banned_until 
      FROM auth.users;
    `;
    
    console.log('\n--- Remote Users Found ---');
    console.table(users);
  } catch (err) {
    console.error('Error querying auth.users:', err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

inspect();
