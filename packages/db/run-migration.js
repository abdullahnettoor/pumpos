import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const dbUrl = 'postgresql://postgres:CsljzYX66FXm2xDC@db.sniubtppskopxkpznfkh.supabase.co:5432/postgres';

console.log('Connecting to:', dbUrl.replace(/:[^:@]+@/, ':***@'));

const sql = postgres(dbUrl, { max: 1 });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('✅ Migrations applied successfully programmatically!');
} catch (error) {
  console.error('❌ Migration failed with error:', error);
} finally {
  await sql.end();
}
