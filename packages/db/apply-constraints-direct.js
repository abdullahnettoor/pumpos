import postgres from 'postgres';
import fs from 'fs';

const dbUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error('Missing DIRECT_DATABASE_URL (or DATABASE_URL) for constraints script');
}

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
