import postgres from 'postgres';

const connectionString = 'postgresql://postgres.sniubtppskopxkpznfkh:CsljzYX66FXm2xDC@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';
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
  } finally {
    await sql.end();
  }
}

inspect();
