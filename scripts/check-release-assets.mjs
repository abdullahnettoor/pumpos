#!/usr/bin/env node
/**
 * The last gate before a release leaves draft: every asset `latest.json`
 * promises is actually attached to the release.
 *
 * A draft release's assets are not reachable at the public URLs installed
 * clients use, so reachability cannot be proved before publication — but
 * *presence* can, and presence is what catches the failure modes that matter:
 * a target whose build failed, an artifact that was never uploaded, a manifest
 * naming a file from a different version. Anything this misses is caught
 * afterwards by scripts/smoke-updater.mjs against the real endpoint.
 *
 * Usage: node scripts/check-release-assets.mjs latest.json assets.json
 *   assets.json is `gh release view <tag> --json assets --jq '[.assets[].name]'`
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_TARGETS, validateUpdaterManifest } from './updater-manifest.mjs';

/** The file name a manifest URL points at. */
export function assetNameFromUrl(url) {
  return decodeURIComponent(String(url).split('/').pop() ?? '');
}

export function assertManifestAssetsPresent(manifest, assetNames) {
  validateUpdaterManifest(manifest);

  const present = new Set(assetNames);
  const problems = [];

  for (const target of SUPPORTED_TARGETS) {
    const name = assetNameFromUrl(manifest.platforms[target].url);
    if (!present.has(name)) {
      problems.push(`${target} references ${name}, which is not attached to the release`);
    }
  }

  // Two targets pointing at one file means a build's artifact silently replaced
  // another's — the kind of release where half the estate updates into the
  // wrong binary.
  const names = SUPPORTED_TARGETS.map((t) => assetNameFromUrl(manifest.platforms[t].url));
  if (new Set(names).size !== names.length) {
    problems.push(`two targets reference the same asset: ${names.join(', ')}`);
  }

  for (const name of names) {
    if (present.has(name) && !present.has(`${name}.sig`)) {
      problems.push(`${name} is on the release without its ${name}.sig`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`release is not publishable:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  try {
    const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const assets = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    assertManifestAssetsPresent(manifest, assets);
    console.log(`Every asset latest.json references is attached to the release.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
