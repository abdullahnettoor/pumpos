#!/usr/bin/env node
/**
 * Smoke-test the published stable update channel — the exact URLs installed
 * PumpOS clients use.
 *
 * "The release workflow succeeded" is not the same as "operators can update".
 * The manifest can be published with a URL that 404s, a version that disagrees
 * with the tag, or a platform entry that never got uploaded, and nothing in the
 * build would notice. This does, before the release is announced, and again on
 * demand whenever an update is reported as broken.
 *
 * Usage:
 *   node scripts/smoke-updater.mjs                       # the public stable endpoint
 *   node scripts/smoke-updater.mjs --url <latest.json>   # a candidate manifest
 *   node scripts/smoke-updater.mjs --expect-version 1.2.3
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_TARGETS, validateUpdaterManifest } from './updater-manifest.mjs';

export const STABLE_MANIFEST_URL =
  'https://github.com/abdullahnettoor/pumpos/releases/latest/download/latest.json';

/**
 * Fetch the manifest, validate it, then confirm every asset it references is
 * actually reachable. `fetchImpl` is injected so the test suite exercises the
 * failure modes without the network.
 */
export async function smokeUpdaterManifest({
  url = STABLE_MANIFEST_URL,
  expectVersion,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const response = await fetchImpl(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`manifest ${url} returned HTTP ${response.status}`);
  }
  let manifest;
  try {
    manifest = await response.json();
  } catch {
    throw new Error(`manifest ${url} is not valid JSON`);
  }

  validateUpdaterManifest(manifest, expectVersion ? { version: expectVersion } : undefined);
  log(`  manifest  ${url} -> v${manifest.version}`);

  for (const target of SUPPORTED_TARGETS) {
    const assetUrl = manifest.platforms[target].url;
    // HEAD keeps the check cheap; a server that refuses HEAD still answers a
    // ranged GET, so fall back rather than reporting a false outage.
    let assetResponse = await fetchImpl(assetUrl, { method: 'HEAD', redirect: 'follow' });
    if (assetResponse.status === 405 || assetResponse.status === 501) {
      assetResponse = await fetchImpl(assetUrl, {
        method: 'GET',
        headers: { range: 'bytes=0-0' },
        redirect: 'follow',
      });
    }
    if (!assetResponse.ok) {
      throw new Error(`${target} asset is unreachable (HTTP ${assetResponse.status}): ${assetUrl}`);
    }
    log(`  asset     ${target} -> ${assetUrl}`);
  }

  return manifest;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  const args = parseArgs(process.argv.slice(2));
  smokeUpdaterManifest({
    url: args.url,
    expectVersion: args['expect-version']?.replace(/^v/, ''),
  })
    .then((manifest) => {
      console.log(`\nStable update channel is serving v${manifest.version} to both targets.`);
    })
    .catch((error) => {
      console.error(`Update channel smoke check failed: ${error.message}`);
      process.exit(1);
    });
}
