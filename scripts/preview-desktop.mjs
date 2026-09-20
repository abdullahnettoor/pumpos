#!/usr/bin/env node
/**
 * Preview desktop builds: identity, version, and the isolation that keeps them
 * away from production.
 *
 * A preview build is a **build**, not a channel. It is installed by hand, it
 * updates nothing, and nothing updates to it. The three properties that make
 * that true:
 *
 *  1. **Its own identity.** A distinct bundle identifier and product name, so a
 *     preview installs *alongside* production instead of replacing an
 *     operator's working PumpOS. Without this, testing a beta costs you the
 *     application you rely on, and support cannot tell the two apart.
 *  2. **A version that is visibly not a release.** `X.Y.Z-preview.<sha>` names
 *     the commit it came from and, being a SemVer prerelease, sorts *below* the
 *     release it derives from — so a preview can never offer itself as newer
 *     than a shipped version.
 *  3. **No updater artifacts.** Nothing signed, nothing a stable client could
 *     ever read. The signing key is unreachable from `dev` anyway (the
 *     `desktop-signing` environment is branch-restricted), but a build that
 *     cannot produce updater output at all does not depend on that.
 *
 * The committed production configuration is never modified: this emits an
 * override applied at build time with `tauri build --config`.
 *
 * Usage:
 *   node scripts/preview-desktop.mjs config <base-version> <sha>   # override to stdout
 *   node scripts/preview-desktop.mjs version <base-version> <sha>  # version to stdout
 *   node scripts/preview-desktop.mjs verify <bundle-dir> <version> # isolation gate
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Deliberately not `com.pumpos.desktop` with a suffix that a human might read
 * as the same app. macOS and Windows key installs off the identifier, so this
 * being distinct is what lets both sit on one machine.
 */
export const PREVIEW_IDENTIFIER = 'com.pumpos.desktop.preview';
export const PREVIEW_PRODUCT_NAME = 'PumpOS Preview';

/**
 * How the production identity appears in build output: `PumpOS.app`,
 * `PumpOS_1.2.3_universal.dmg`. The trailing delimiter is what keeps
 * `PumpOS Preview_…` from matching — the preview name shares its prefix.
 */
const PRODUCTION_ARTIFACT = /^PumpOS[._]/;

/** Length of the commit SHA carried in the version. */
const SHA_LENGTH = 7;

/**
 * `X.Y.Z-preview.<short-sha>`.
 *
 * Fails loudly on bad input rather than producing something ambiguous: a build
 * labelled with a version nobody can trace is worse than no build.
 */
export function previewVersion(baseVersion, sha) {
  if (!/^\d+\.\d+\.\d+$/.test(baseVersion ?? '')) {
    throw new Error(`"${baseVersion}" is not a plain X.Y.Z SemVer`);
  }
  if (!/^[0-9a-f]{7,40}$/i.test(sha ?? '')) {
    throw new Error(`"${sha}" is not a commit SHA`);
  }
  return `${baseVersion}-preview.${sha.slice(0, SHA_LENGTH).toLowerCase()}`;
}

/**
 * The Tauri configuration override for a preview build.
 *
 * Only the keys that differ from production appear here — Tauri merges this
 * over the committed config, so anything omitted is inherited and cannot drift
 * from what a release build does.
 */
export function buildPreviewConfig({ baseVersion, sha }) {
  return {
    productName: PREVIEW_PRODUCT_NAME,
    identifier: PREVIEW_IDENTIFIER,
    version: previewVersion(baseVersion, sha),
    bundle: {
      // The point of the whole exercise: a preview build leaves nothing signed
      // and nothing a stable client could read.
      createUpdaterArtifacts: false,
    },
  };
}

/** Updater output, by the shapes Tauri produces. */
function isUpdaterArtifact(name) {
  return name.endsWith('.app.tar.gz') || name.endsWith('.nsis.zip');
}

/**
 * Every entry under `dir`, directories included.
 *
 * Directories matter: a macOS application *is* a directory (`PumpOS.app`), so a
 * walk that only yielded files would never see the single most direct
 * expression of the build's identity.
 */
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const directory = statSync(path).isDirectory();
    found.push({ name: entry, path, directory });
    if (directory) found.push(...walk(path));
  }
  return found;
}

/**
 * The gate that runs before a preview artifact is uploaded anywhere.
 *
 * Asserting isolation rather than assuming it: a preview that shipped a
 * signature, an updater artifact, or a release version would be
 * indistinguishable from a real release to anything that found it later.
 */
export function assertPreviewIsolation(bundleDir, { version }) {
  const files = walk(resolve(bundleDir));
  const problems = [];

  // Installers only — `.app` bundles and their contents are directories of
  // build output, not things we hand to a tester.
  const installers = files.filter(
    // `[\\/]` rather than `/`: Windows runners produce backslash paths, and a
    // separator assumption here would quietly stop excluding bundle internals.
    (f) => !f.directory && /\.(dmg|msi|exe)$/i.test(f.name) && !/\.app[\\/]/.test(f.path),
  );

  for (const file of files.filter((f) => !f.directory)) {
    if (file.name.endsWith('.sig')) {
      problems.push(`${file.name} is a signature — a preview build must sign nothing`);
    } else if (isUpdaterArtifact(file.name)) {
      problems.push(`${file.name} is an updater artifact — a preview build must produce none`);
    }
  }

  if (installers.length === 0) {
    problems.push('no preview artifacts were produced');
  }

  // Identity, not just version. An artifact carrying the production name means
  // the override never applied, and installing it would replace an operator's
  // real PumpOS rather than sitting beside it.
  for (const file of files) {
    if (PRODUCTION_ARTIFACT.test(file.name)) {
      problems.push(`${file.name} carries the production identity, not ${PREVIEW_PRODUCT_NAME}`);
    }
  }

  for (const installer of installers) {
    if (!installer.name.includes(PREVIEW_PRODUCT_NAME)) {
      problems.push(`${installer.name} is not named ${PREVIEW_PRODUCT_NAME}`);
    }
    // A release version on the artifact means the override never applied.
    if (!installer.name.includes(version)) {
      problems.push(`${installer.name} is not versioned ${version}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`preview build is not isolated:\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'version') {
    process.stdout.write(`${previewVersion(rest[0], rest[1])}\n`);
    return;
  }
  if (command === 'config') {
    const config = buildPreviewConfig({ baseVersion: rest[0], sha: rest[1] });
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return;
  }
  if (command === 'verify') {
    assertPreviewIsolation(rest[0], { version: rest[1] });
    console.log(`Preview build is isolated: nothing signed, nothing updatable, ${rest[1]}.`);
    return;
  }
  throw new Error('Usage: preview-desktop.mjs <version|config|verify> ...');
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
