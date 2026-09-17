#!/usr/bin/env node
/**
 * Stamp an exact release version into build manifests.
 *
 * The latest Git tag is the released version. The merge-time Release workflow
 * calls this script in disposable build workspaces so generated artifacts carry
 * that version without adding release-only commits to main or dev.
 *
 * Usage:
 *   node scripts/release.mjs 1.5.0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function stampReleaseVersion(root, version, log = console.log) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Version must be X.Y.Z');

  const packageFiles = [
    join(root, 'package.json'),
    ...['api', 'console', 'desktop', 'marketing', 'mobile'].map((name) =>
      join(root, 'apps', name, 'package.json'),
    ),
    ...['core', 'db', 'shared', 'ui'].map((name) => join(root, 'packages', name, 'package.json')),
  ];

  for (const file of packageFiles) {
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg.version === undefined) continue;
    pkg.version = version;
    writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
    log(`  updated  ${file.replace(root + '/', '')}`);
  }

  const lockfiles = [
    {
      file: join(root, 'package-lock.json'),
      workspaces: new Set([
        '',
        'apps/api',
        'apps/console',
        'apps/desktop',
        'apps/mobile',
        'packages/core',
        'packages/db',
        'packages/shared',
        'packages/ui',
      ]),
    },
    { file: join(root, 'apps/marketing/package-lock.json'), workspaces: new Set(['']) },
  ];
  for (const { file, workspaces } of lockfiles) {
    if (!existsSync(file)) continue;
    const lock = JSON.parse(readFileSync(file, 'utf8'));
    if (lock.version !== undefined) lock.version = version;
    if (lock.packages?.['']?.version !== undefined) lock.packages[''].version = version;
    for (const [path, entry] of Object.entries(lock.packages ?? {})) {
      if (workspaces.has(path) && entry?.version !== undefined) entry.version = version;
    }
    writeFileSync(file, JSON.stringify(lock, null, 2) + '\n');
    log(`  updated  ${file.replace(root + '/', '')}`);
  }

  const tauriConf = join(root, 'apps/desktop/src-tauri/tauri.conf.json');
  if (existsSync(tauriConf)) {
    const config = JSON.parse(readFileSync(tauriConf, 'utf8'));
    config.version = version;
    writeFileSync(tauriConf, JSON.stringify(config, null, 2) + '\n');
    log(`  updated  ${tauriConf.replace(root + '/', '')}`);
  }

  const cargoToml = join(root, 'apps/desktop/src-tauri/Cargo.toml');
  if (existsSync(cargoToml)) {
    const raw = readFileSync(cargoToml, 'utf8');
    writeFileSync(cargoToml, raw.replace(/^version = ".*"/m, `version = "${version}"`));
    log(`  updated  ${cargoToml.replace(root + '/', '')}`);
  }

  const cargoLock = join(root, 'apps/desktop/src-tauri/Cargo.lock');
  if (existsSync(cargoLock)) {
    const raw = readFileSync(cargoLock, 'utf8');
    const packagePattern = /(\[\[package\]\]\nname = "pumpos"\nversion = ")[^"]+("\n)/;
    if (!packagePattern.test(raw)) {
      throw new Error(`could not find pumpos package in ${cargoLock}`);
    }
    const next = raw.replace(packagePattern, `$1${version}$2`);
    writeFileSync(cargoLock, next);
    log(`  updated  ${cargoLock.replace(root + '/', '')}`);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  const version = process.argv[2];
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    console.error('Usage: node scripts/release.mjs X.Y.Z');
    process.exit(1);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`Stamping release version ${version}`);
  stampReleaseVersion(root, version);
  console.log(`\nRelease manifests stamped at ${version}.`);
}
