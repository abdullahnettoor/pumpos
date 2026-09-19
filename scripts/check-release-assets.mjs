#!/usr/bin/env node
/**
 * The last gate before a release leaves draft: every asset `latest.json`
 * promises is attached to the release **and actually fetchable**.
 *
 * A draft's assets are not served at the public URLs installed clients will
 * use — those only exist once the release is published. But the same bytes are
 * reachable now through the authenticated asset API, so "inaccessible" can be
 * caught *before* the stable channel flips rather than reported afterwards.
 * `scripts/smoke-updater.mjs` then re-checks the public URLs after publication;
 * this is what can prevent it.
 *
 * Usage: node scripts/check-release-assets.mjs latest.json assets.json
 *   assets.json is `gh release view <tag> --json assets --jq '.assets'`
 *   GITHUB_TOKEN (or GH_TOKEN) authenticates the draft asset fetch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_TARGETS, validateUpdaterManifest } from './updater-manifest.mjs';

/** The file name a manifest URL points at. */
export function assetNameFromUrl(url) {
  return decodeURIComponent(String(url).split('/').pop() ?? '');
}

/**
 * Structural checks: the manifest names files that exist on the release, each
 * carries its signature, and no two targets share one file (which would mean a
 * build's artifact silently replaced another's — the kind of release where half
 * the estate updates into the wrong binary).
 */
export function assertManifestAssetsPresent(manifest, assets) {
  validateUpdaterManifest(manifest);

  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  const problems = [];
  const names = SUPPORTED_TARGETS.map((target) => assetNameFromUrl(manifest.platforms[target].url));

  SUPPORTED_TARGETS.forEach((target, index) => {
    const name = names[index];
    if (!byName.has(name)) {
      problems.push(`${target} references ${name}, which is not attached to the release`);
      return;
    }
    if (!byName.has(`${name}.sig`)) {
      problems.push(`${name} is on the release without its ${name}.sig`);
    }
    // An asset GitHub is still processing cannot be downloaded, and an empty
    // one is a build that failed quietly.
    if (byName.get(name).state && byName.get(name).state !== 'uploaded') {
      problems.push(`${name} is in state "${byName.get(name).state}", not "uploaded"`);
    }
    if (byName.get(name).size === 0) {
      problems.push(`${name} is empty`);
    }
  });

  if (new Set(names).size !== names.length) {
    problems.push(`two targets reference the same asset: ${names.join(', ')}`);
  }

  if (problems.length > 0) {
    throw new Error(`release is not publishable:\n  - ${problems.join('\n  - ')}`);
  }
  return names.map((name) => byName.get(name));
}

/**
 * Prove each asset can actually be read, with a one-byte ranged request
 * against the authenticated asset API — the artifacts are hundreds of
 * megabytes and we only need to know the bytes are there.
 */
export async function assertReleaseAssetsReachable(
  assets,
  { token, fetchImpl = fetch, log = console.log } = {},
) {
  for (const asset of assets) {
    const url = asset.apiUrl ?? asset.url;
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/octet-stream',
        range: 'bytes=0-0',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(
        `release is not publishable:\n  - ${asset.name} is not fetchable (HTTP ${response.status})`,
      );
    }
    log(`  reachable  ${asset.name}`);
  }
  return true;
}

async function main(argv) {
  const manifest = JSON.parse(readFileSync(argv[0], 'utf8'));
  const assets = JSON.parse(readFileSync(argv[1], 'utf8'));
  const referenced = assertManifestAssetsPresent(manifest, assets);
  await assertReleaseAssetsReachable(referenced, {
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
  });
  console.log('\nEvery asset latest.json references is attached and fetchable.');
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
