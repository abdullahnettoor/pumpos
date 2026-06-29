#!/usr/bin/env node

/**
 * dev-remote.mjs
 * 
 * Local development against remote Supabase.
 * Launches Wrangler dev server with proper Hyperdrive binding.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('🚀 Starting PumpOS API dev server (remote Supabase)...\n');

try {
  // Run wrangler dev --remote so the Worker runs on Cloudflare's edge.
  // This bypasses local workerd TLS issues (Zscaler cert chain) since all
  // DB/outbound connections happen on Cloudflare infrastructure, not locally.
  execSync(
    'wrangler dev src/index.ts --remote',
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Ensure we're in dev mode
        NODE_ENV: 'development',
        // Bypass Zscaler TLS interception (temporary workaround)
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      }
    }
  );
} catch (error) {
  // execSync throws on non-zero exit, but that's expected when Ctrl+C is pressed
  if (error.status !== 0 && error.signal !== 'SIGINT') {
    console.error('\n❌ Dev server failed:', error.message);
    process.exit(1);
  }
}
