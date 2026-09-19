#!/usr/bin/env node
/**
 * Assert that every desktop version source agrees with the release tag.
 *
 * PumpOS stamps one SemVer into the release workspace rather than committing
 * it (see scripts/release.mjs and RELEASING.md). That keeps main clean, but it
 * also means nothing would notice if a stamp missed a file — and a desktop
 * build whose Tauri config, Cargo package and `latest.json` disagree produces
 * an update that either never offers itself or offers itself forever.
 *
 * So the release workflow stamps, then runs this. A mismatch stops the release
 * before any artifact is signed or uploaded.
 *
 * Usage: node scripts/check-desktop-versions.mjs 1.2.3
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every place a desktop release version has to be identical. */
export function collectDesktopVersions(root) {
  const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const cargoToml = readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8');
  const cargoLock = readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.lock'), 'utf8');

  return {
    'package.json': json('package.json').version,
    'apps/desktop/package.json': json('apps/desktop/package.json').version,
    'package-lock.json (apps/desktop)':
      json('package-lock.json').packages?.['apps/desktop']?.version,
    'apps/desktop/src-tauri/tauri.conf.json': json('apps/desktop/src-tauri/tauri.conf.json')
      .version,
    'apps/desktop/src-tauri/Cargo.toml': /^version = "(.+)"/m.exec(cargoToml)?.[1],
    'apps/desktop/src-tauri/Cargo.lock':
      /\[\[package\]\]\r?\nname = "pumpos"\r?\nversion = "(.+)"/.exec(cargoLock)?.[1],
  };
}

export function assertDesktopVersionsMatch(root, version) {
  const expected = String(version ?? '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(expected)) {
    throw new Error(`"${version}" is not a plain X.Y.Z SemVer`);
  }
  const versions = collectDesktopVersions(root);
  const mismatched = Object.entries(versions).filter(([, found]) => found !== expected);
  if (mismatched.length > 0) {
    throw new Error(
      `desktop version sources disagree with ${expected}:\n` +
        mismatched.map(([file, found]) => `  - ${file}: ${found ?? 'not found'}`).join('\n'),
    );
  }
  return versions;
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    assertDesktopVersionsMatch(root, process.argv[2]);
    console.log(`All desktop version sources report ${process.argv[2]}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
