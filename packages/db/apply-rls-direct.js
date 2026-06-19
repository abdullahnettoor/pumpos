import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

const dbUrl = 'postgresql://postgres:CsljzYX66FXm2xDC@db.sniubtppskopxkpznfkh.supabase.co:5432/postgres';

console.log('Connecting to remote Supabase to apply RLS policies directly...');

const sql = postgres(dbUrl);

try {
  const sqlFileContent = fs.readFileSync('./migrations/0003_enable_rls.sql', 'utf8');
  
  // Split statements by semicolon, but ignore semicolons inside parentheses or strings if any
  // A simpler way: since drizzle-kit uses `--> statement-breakpoint` or we can just run the whole script as one transaction!
  // Yes! We can run the entire file content as a single raw query transaction:
  await sql.unsafe(sqlFileContent);
  
  console.log('✅ RLS policies applied successfully directly to remote Supabase!');
} catch (error) {
  console.error('❌ Failed to apply Rrizzle migrations directly:', error);
} finally {
  await sql.end();
}
