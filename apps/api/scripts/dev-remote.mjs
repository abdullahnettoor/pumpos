import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadValueFromDotEnv(filePath, key) {
  if (!existsSync(filePath)) {
    return '';
  }

  const content = readFileSync(filePath, 'utf8');
  const line = content.split(/\r?\n/).find((entry) => entry.startsWith(`${key}=`));
  if (!line) {
    return '';
  }

  return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
}

function loadRawValue(filePath) {
  if (!existsSync(filePath)) {
    return '';
  }

  return readFileSync(filePath, 'utf8').trim().replace(/^"|"$/g, '');
}

const pooledUrl = process.env.DATABASE_URL
  || loadValueFromDotEnv(resolve(process.cwd(), '.dev.vars'), 'DATABASE_URL')
  || loadRawValue(resolve(process.cwd(), '../../supabase/.temp/pooler-url'));

const directUrl = process.env.DIRECT_DATABASE_URL
  || loadValueFromDotEnv(resolve(process.cwd(), '.dev.vars'), 'DIRECT_DATABASE_URL');

const connectionString = pooledUrl || directUrl;

if (!connectionString) {
  console.error('Missing DIRECT_DATABASE_URL and apps/api/.dev.vars. Set DIRECT_DATABASE_URL to your Supabase connection string.');
  process.exit(1);
}

const child = spawn('wrangler', ['dev', 'src/index.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: connectionString,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
