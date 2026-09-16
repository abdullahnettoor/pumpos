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
 *   npm run release -- auto           # derive the bump from merged commits
 *   npm run release -- patch          # 1.2.3 -> 1.2.4
 *   npm run release -- minor          # 1.2.3 -> 1.3.0
 *   npm run release -- major          # 1.2.3 -> 2.0.0
 *   npm run release -- 1.5.0          # explicit version
 *   npm run release -- patch --dry    # preview only, no writes/commit/tag
 *   npm run release -- auto --no-git  # write version files only (CI uses this)
 *
 * After it runs:  git push --follow-tags
 *
 * `auto` is the path CI uses and the one to prefer by hand: it reads the bump
 * off the commit subjects since the last tag (see next-version.mjs) instead of
 * relying on someone remembering which kind of release this is.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const noGit = args.includes('--no-git');
const bump = args.find((a) => !a.startsWith('--')) ?? 'patch';

const rootPkgPath = join(root, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
const current = rootPkg.version;

function nextVersion(cur, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind; // explicit
  if (kind === 'auto') {
    const derived = JSON.parse(
      execSync('node scripts/next-version.mjs --json', { cwd: root }).toString(),
    );
    if (derived.bump === 'none') {
      console.log(
        `Nothing release-worthy since the last tag (${derived.range}). No release.\n` +
          'Only feat/fix/perf commits, or a breaking change, produce a version.',
      );
      process.exit(0);
    }
    console.log(`Derived bump "${derived.bump}" from ${derived.commits} commit(s).`);
    return derived.version;
  }
  const [maj, min, pat] = cur.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`Unknown bump "${kind}" — use patch | minor | major | X.Y.Z`);
}

const version = nextVersion(current, bump);
const tag = `v${version}`;

// Abort on a dirty tree so the release commit stays clean. Irrelevant when we
// are not making one (--dry, --no-git).
const status = execSync('git status --porcelain', { cwd: root }).toString().trim();
if (status && !dry && !noGit) {
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
  edits.push({
    file,
    apply: () => {
      pkg.version = version;
      writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
    },
  });
}

// Tauri config (JSON "version") + Rust crate (Cargo.toml "version").
const tauriConf = join(root, 'apps/desktop/src-tauri/tauri.conf.json');
if (existsSync(tauriConf)) {
  edits.push({
    file: tauriConf,
    apply: () => {
      // Replace only the version line: a JSON.parse → stringify round-trip
      // reflows the whole file and breaks Prettier's formatting.
      const raw = readFileSync(tauriConf, 'utf8');
      const next = raw.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`);
      if (next === raw && JSON.parse(raw).version !== version) {
        throw new Error(`could not find "version" in ${tauriConf}`);
      }
      writeFileSync(tauriConf, next);
    },
  });
}
const cargo = join(root, 'apps/desktop/src-tauri/Cargo.toml');
if (existsSync(cargo)) {
  edits.push({
    file: cargo,
    apply: () => {
      const txt = readFileSync(cargo, 'utf8').replace(/^version = ".*"/m, `version = "${version}"`);
      writeFileSync(cargo, txt);
    },
  });
}

for (const e of edits) {
  console.log(`  ${dry ? 'would update' : 'updated'}  ${e.file.replace(root + '/', '')}`);
  if (!dry) e.apply();
}

if (dry) {
  console.log('\nDry run — no files written, no commit/tag created.');
  process.exit(0);
}

if (noGit) {
  // CI writes the version files inside a PR and lets the normal review + merge
  // path carry them, rather than committing straight to a protected branch.
  console.log(`\n✓ Version files written for ${version} (no commit/tag).`);
  process.exit(0);
}

// --- Commit + tag ------------------------------------------------------------
execSync('git add -A', { cwd: root, stdio: 'inherit' });
execSync(`git commit -m "release: ${tag}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag -a ${tag} -m "PumpOS ${tag}"`, { cwd: root, stdio: 'inherit' });

console.log(`\n✓ Committed and tagged ${tag}.`);
console.log('  Push to trigger deploy + desktop release:');
console.log('    git push --follow-tags');
