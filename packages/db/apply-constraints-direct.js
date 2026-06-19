import postgres from 'postgres';
import fs from 'fs';

const dbUrl = 'postgresql://postgres:CsljzYX66FXm2xDC@db.sniubtppskopxkpznfkh.supabase.co:5432/postgres';

console.log('Connecting to remote Supabase to apply Unique Constraints and clean duplicates directly...');

const sql = postgres(dbUrl);

try {
  const sqlFileContent = fs.readFileSync('./migrations/0004_add_unique_constraints.sql', 'utf8');
  
  await sql.unsafe(sqlFileContent);
  
  console.log('✅ Duplicates cleaned up and unique constraints applied successfully directly to remote Supabase!');
} catch (error) {
  console.error('❌ Failed to apply SQL constraints directly:', error);
} finally {
  await sql.end();
}
