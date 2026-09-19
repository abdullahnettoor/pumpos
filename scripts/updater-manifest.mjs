#!/usr/bin/env node
/**
 * Generate and validate `latest.json` — the manifest installed PumpOS clients
 * poll on the stable channel.
 *
 * Every field here is load-bearing at a station's machine: a wrong version
 * offers an update nobody can install, a wrong URL fails the download, and a
 * signature *path* where the signature *contents* belong makes the updater
 * reject an otherwise valid release. None of that is visible until an operator
 * hits it, so the manifest is generated from the built artifacts and validated
 * before the release leaves draft.
 *
 * Supported targets are exactly macOS universal and Windows x64. Linux is not
 * built, not listed, and not documented.
 *
 * Usage:
 *   node scripts/updater-manifest.mjs --version 1.2.3 --dir <collected-artifacts> \
 *     --base-url https://github.com/<owner>/<repo>/releases/download/v1.2.3 \
 *     [--notes-file NOTES.md] [--pub-date 2026-05-01T00:00:00Z] > latest.json
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The only platforms PumpOS ships. Both must be present in every manifest. */
export const SUPPORTED_TARGETS = ['darwin-universal', 'windows-x86_64'];

/**
 * Map a built artifact to its updater target.
 *
 * Windows deliberately updates through the **NSIS** installer (`-setup.exe`)
 * and not the MSI: a release that listed both would leave the updater picking
 * one and the release notes describing the other. The MSI stays on the release
 * as a human-installable download only.
 */
export function classifyUpdaterAsset(fileName) {
  const name = basename(fileName).toLowerCase();
  if (name.endsWith('.app.tar.gz')) return 'darwin-universal';
  if (name.endsWith('-setup.exe') || name.endsWith('.nsis.zip')) return 'windows-x86_64';
  return null;
}

/**
 * Collect updater assets from a directory of `<artifact>.sig` files.
 *
 * Only the signature files are required: the artifacts themselves are hundreds
 * of megabytes and already uploaded to the draft release by the build jobs, so
 * shipping them between jobs just to name them would be waste. The signature
 * *contents* are read here — never its path, which is the classic way to
 * produce a manifest that validates structurally and fails on every client.
 *
 * An updater artifact present without its `.sig` is still an error: it means a
 * build produced something unsigned that a release might otherwise carry.
 */
export function collectUpdaterAssets(dir, baseUrl) {
  const names = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
  const signed = new Set(names.filter((n) => n.endsWith('.sig')).map((n) => n.slice(0, -4)));

  for (const name of names) {
    if (name.endsWith('.sig')) continue;
    if (classifyUpdaterAsset(name) && !signed.has(name)) {
      throw new Error(`${name} has no ${name}.sig — the build did not sign it`);
    }
  }

  const assets = [];
  for (const name of [...signed].sort()) {
    const target = classifyUpdaterAsset(name);
    if (!target) continue;
    assets.push({
      target,
      name,
      url: `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(name)}`,
      signature: readFileSync(join(dir, `${name}.sig`), 'utf8').trim(),
    });
  }
  return assets;
}

export function buildUpdaterManifest({ version, notes = '', pubDate, assets }) {
  const platforms = {};
  for (const asset of assets) {
    if (platforms[asset.target]) {
      throw new Error(
        `two artifacts claim ${asset.target} (${platforms[asset.target].name} and ${asset.name})`,
      );
    }
    platforms[asset.target] = { signature: asset.signature, url: asset.url, name: asset.name };
  }
  const manifest = {
    version,
    notes,
    pub_date: pubDate ?? new Date().toISOString(),
    platforms: Object.fromEntries(
      SUPPORTED_TARGETS.filter((target) => platforms[target]).map((target) => [
        target,
        { signature: platforms[target].signature, url: platforms[target].url },
      ]),
    ),
  };
  validateUpdaterManifest(manifest, { version });
  return manifest;
}

/**
 * The gate that keeps a broken release in draft.
 *
 * Deliberately strict about things that would only surface on an operator's
 * machine: an unexpected platform key, a missing one, a non-HTTPS URL, a URL
 * for a different version, or a signature that is a file path.
 */
export function validateUpdaterManifest(manifest, { version } = {}) {
  const problems = [];
  if (!/^\d+\.\d+\.\d+$/.test(manifest?.version ?? '')) {
    problems.push(`version "${manifest?.version}" is not a plain X.Y.Z SemVer`);
  }
  if (version && manifest.version !== version) {
    problems.push(`manifest version ${manifest.version} does not match the tag ${version}`);
  }
  if (typeof manifest?.notes !== 'string') problems.push('notes must be a string');
  if (Number.isNaN(Date.parse(manifest?.pub_date ?? ''))) {
    problems.push(`pub_date "${manifest?.pub_date}" is not a date`);
  }

  const targets = Object.keys(manifest?.platforms ?? {});
  for (const target of SUPPORTED_TARGETS) {
    if (!targets.includes(target)) problems.push(`missing required target ${target}`);
  }
  for (const target of targets) {
    if (!SUPPORTED_TARGETS.includes(target)) {
      problems.push(`unsupported target ${target} (PumpOS ships macOS universal and Windows x64)`);
    }
    const entry = manifest.platforms[target];
    if (!entry?.url?.startsWith('https://')) {
      problems.push(`${target} url must be HTTPS, got "${entry?.url}"`);
    } else if (manifest.version && !entry.url.includes(manifest.version)) {
      problems.push(`${target} url does not point at v${manifest.version}: ${entry.url}`);
    }
    const signature = entry?.signature;
    if (typeof signature !== 'string' || signature.trim().length === 0) {
      problems.push(`${target} has no signature`);
    } else if (/[\\/]|\.sig$/.test(signature.trim())) {
      problems.push(`${target} signature looks like a file path, not the signature contents`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`latest.json is not publishable:\n  - ${problems.join('\n  - ')}`);
  }
  return manifest;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const version = String(args.version ?? '').replace(/^v/, '');
  if (!args.dir || !args['base-url']) {
    throw new Error('Usage: --version X.Y.Z --dir <artifacts> --base-url <https://...>');
  }
  const notes = args['notes-file'] ? readFileSync(args['notes-file'], 'utf8').trim() : '';
  const manifest = buildUpdaterManifest({
    version,
    notes,
    pubDate: args['pub-date'],
    assets: collectUpdaterAssets(resolve(args.dir), args['base-url']),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
