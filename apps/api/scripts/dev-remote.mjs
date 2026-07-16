#!/usr/bin/env node

/**
 * dev-remote.mjs
 * 
 * Local development against remote Supabase.
 * Launches local Wrangler dev server with proper local Hyperdrive binding.
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

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

const devVarsPath = path.resolve(projectRoot, '.dev.vars');

const directUrl = process.env.DIRECT_DATABASE_URL
  || loadValueFromDotEnv(devVarsPath, 'DIRECT_DATABASE_URL');

const pooledUrl = process.env.DATABASE_URL
  || loadValueFromDotEnv(devVarsPath, 'DATABASE_URL')
  || loadRawValue(path.resolve(projectRoot, '../../supabase/.temp/pooler-url'));

const connectionString = directUrl || pooledUrl;

if (!connectionString) {
  console.error('Missing DIRECT_DATABASE_URL and apps/api/.dev.vars. Set DIRECT_DATABASE_URL to your Supabase connection string.');
  process.exit(1);
}

console.log('🚀 Starting PumpOS API dev server (local Wrangler connecting to remote Supabase)...\n');

const child = spawn('wrangler', ['dev', 'src/index.ts'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: connectionString,
    NODE_ENV: 'development',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
