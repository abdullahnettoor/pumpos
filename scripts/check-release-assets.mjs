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
import {
  SUPPORTED_TARGETS,
  classifyUpdaterAsset,
  validateUpdaterManifest,
} from './updater-manifest.mjs';

/** The file name a manifest URL points at. */
export function assetNameFromUrl(url) {
  return decodeURIComponent(String(url).split('/').pop() ?? '');
}

/**
 * Structural checks: the manifest names files that exist on the release, each
 * carries its signature, and each key points at a file that can actually serve
 * that platform.
 *
 * Note what is NOT checked: two keys sharing one file. That is legitimate — the
 * universal macOS artifact serves both Apple Silicon and Intel. The real risk
 * is a file under a key it cannot serve (a Windows installer offered to a Mac),
 * which `classifyUpdaterAsset` decides directly instead of being inferred from
 * a duplicate count.
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
    if (!classifyUpdaterAsset(name).includes(target)) {
      problems.push(`${target} points at ${name}, which cannot serve that platform`);
    }
  });

  if (problems.length > 0) {
    throw new Error(`release is not publishable:\n  - ${problems.join('\n  - ')}`);
  }
  // One entry per distinct file: the universal macOS artifact is referenced by
  // two keys and does not need fetching twice.
  return [...new Set(names)].map((name) => byName.get(name));
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
