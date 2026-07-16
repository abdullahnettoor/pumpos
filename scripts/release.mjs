#!/usr/bin/env node
/**
 * Unified release helper for the PumpOS monorepo.
 *
 * One version drives everything (web apps + desktop). This script bumps the
 * version across all workspace package.json files, the Tauri config, and the
 * Rust crate, then commits and creates the `vX.Y.Z` tag that the Deploy +
 * Desktop release workflows trigger on.
 *
 * Usage:
 *   npm run release -- patch          # 1.2.3 -> 1.2.4
 *   npm run release -- minor          # 1.2.3 -> 1.3.0
 *   npm run release -- major          # 1.2.3 -> 2.0.0
 *   npm run release -- 1.5.0          # explicit version
 *   npm run release -- patch --dry    # preview only, no writes/commit/tag
 *
 * After it runs:  git push --follow-tags
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const bump = args.find((a) => !a.startsWith('--')) ?? 'patch';

const rootPkgPath = join(root, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
const current = rootPkg.version;

function nextVersion(cur, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind; // explicit
  const [maj, min, pat] = cur.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Unknown bump "${kind}" — use patch | minor | major | X.Y.Z`);
}

const version = nextVersion(current, bump);
const tag = `v${version}`;

// Abort on a dirty tree (except in --dry) so the release commit stays clean.
const status = execSync('git status --porcelain', { cwd: root }).toString().trim();
if (status && !dry) {
  console.error('✗ Working tree is not clean. Commit or stash changes first.\n' + status);
  process.exit(1);
}

console.log(`Release: ${current} → ${version}${dry ? '  (dry run)' : ''}`);

// --- Collect files to update -------------------------------------------------
const pkgGlobs = ['package.json', 'apps/*/package.json', 'packages/*/package.json'];
const pkgFiles = pkgGlobs.flatMap((g) => {
  if (!g.includes('*')) return [join(root, g)];
  const base = join(root, g.split('/')[0]);
  if (!existsSync(base)) return [];
  return execSync(`ls -d ${g.replace('*', '*')}`, { cwd: root })
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((p) => join(root, p));
});

const edits = [];

for (const file of pkgFiles) {
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (pkg.version === undefined) continue;
  edits.push({ file, apply: () => {
    pkg.version = version;
    writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  }});
}

// Tauri config (JSON "version") + Rust crate (Cargo.toml "version").
const tauriConf = join(root, 'apps/desktop/src-tauri/tauri.conf.json');
if (existsSync(tauriConf)) {
  edits.push({ file: tauriConf, apply: () => {
    const conf = JSON.parse(readFileSync(tauriConf, 'utf8'));
    conf.version = version;
    writeFileSync(tauriConf, JSON.stringify(conf, null, 2) + '\n');
  }});
}
const cargo = join(root, 'apps/desktop/src-tauri/Cargo.toml');
if (existsSync(cargo)) {
  edits.push({ file: cargo, apply: () => {
    const txt = readFileSync(cargo, 'utf8').replace(/^version = ".*"/m, `version = "${version}"`);
    writeFileSync(cargo, txt);
  }});
}

for (const e of edits) {
  console.log(`  ${dry ? 'would update' : 'updated'}  ${e.file.replace(root + '/', '')}`);
  if (!dry) e.apply();
}

if (dry) {
  console.log('\nDry run — no files written, no commit/tag created.');
  process.exit(0);
}

// --- Commit + tag ------------------------------------------------------------
execSync('git add -A', { cwd: root, stdio: 'inherit' });
execSync(`git commit -m "release: ${tag}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag -a ${tag} -m "PumpOS ${tag}"`, { cwd: root, stdio: 'inherit' });

console.log(`\n✓ Committed and tagged ${tag}.`);
console.log('  Push to trigger deploy + desktop release:');
console.log('    git push --follow-tags');
