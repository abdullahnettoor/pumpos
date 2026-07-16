#!/usr/bin/env node
/**
 * Generates the public download manifest for the desktop installers, matching
 * the shape `apps/marketing` reads. URLs point at the R2 public base; the
 * desktop release workflow uploads this to R2 so the download page always
 * reflects the latest release.
 *
 * Usage: node scripts/gen-download-manifest.mjs <version> <publicBase> > manifest.json
 *   version    e.g. 1.2.3 (a leading "v" is stripped)
 *   publicBase e.g. https://downloads.pumpos.app  (no trailing slash needed)
 */
const [, , versionArg = '0.0.0', baseArg = ''] = process.argv;
const version = versionArg.replace(/^v/, '');
const base = baseArg.replace(/\/$/, '');
const dir = `${base}/pumpos/v${version}`;

// Filenames match Tauri's default bundle naming.
const macDmg = `${dir}/PumpOS_${version}_universal.dmg`;
const winMsi = `${dir}/PumpOS_${version}_x64_en-US.msi`;

const artifact = (url, ext) => ({ url, size: null, sha256: null, ext });

const manifest = {
  version,
  channel: 'stable',
  released_at: new Date().toISOString(),
  artifacts: {
    'windows-x64': artifact(winMsi, 'msi'),
    // Universal build covers both Apple Silicon and Intel.
    'macos-arm64': artifact(macDmg, 'dmg'),
    'macos-x64': artifact(macDmg, 'dmg'),
    // Linux not built yet.
    'linux-x64-appimage': artifact(null, 'AppImage'),
    'linux-x64-deb': artifact(null, 'deb'),
  },
};

process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
