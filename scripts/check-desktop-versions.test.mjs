import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDesktopVersionsMatch, collectDesktopVersions } from './check-desktop-versions.mjs';
import { stampReleaseVersion } from './release.mjs';

function write(root, path, contents) {
  const file = join(root, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, contents);
}

function workspace(version = '0.0.0') {
  const root = mkdtempSync(join(tmpdir(), 'pumpos-desktop-versions-'));
  write(root, 'package.json', `{"name":"root","version":"${version}"}\n`);
  write(root, 'apps/desktop/package.json', `{"name":"apps-desktop","version":"${version}"}\n`);
  write(
    root,
    'package-lock.json',
    `{"version":"${version}","packages":{"":{"version":"${version}"},"apps/desktop":{"version":"${version}"}}}\n`,
  );
  write(root, 'apps/desktop/src-tauri/tauri.conf.json', `{"version":"${version}"}\n`);
  write(root, 'apps/desktop/src-tauri/Cargo.toml', `[package]\nversion = "${version}"\n`);
  write(
    root,
    'apps/desktop/src-tauri/Cargo.lock',
    `[[package]]\nname = "pumpos"\nversion = "${version}"\n`,
  );
  return root;
}

describe('desktop version agreement', () => {
  it('passes once the release stamp has run', () => {
    const root = workspace();
    stampReleaseVersion(root, '2.4.1', () => {});
    expect(() => assertDesktopVersionsMatch(root, '2.4.1')).not.toThrow();
    // The tag arrives with its `v`; the manifests never carry one.
    expect(() => assertDesktopVersionsMatch(root, 'v2.4.1')).not.toThrow();
  });

  it('names every source that disagrees with the tag', () => {
    const root = workspace();
    stampReleaseVersion(root, '2.4.1', () => {});
    write(root, 'apps/desktop/src-tauri/Cargo.toml', '[package]\nversion = "2.4.0"\n');

    expect(() => assertDesktopVersionsMatch(root, '2.4.1')).toThrow(/Cargo\.toml: 2\.4\.0/);
  });

  it('catches a Tauri config the stamp never reached', () => {
    const root = workspace();
    expect(() => assertDesktopVersionsMatch(root, '2.4.1')).toThrow(/tauri\.conf\.json: 0\.0\.0/);
  });

  it('rejects a tag that is not a plain SemVer', () => {
    const root = workspace();
    expect(() => assertDesktopVersionsMatch(root, '2.4')).toThrow(/not a plain X\.Y\.Z SemVer/);
  });

  it('reports every checked source, so a new one cannot be forgotten silently', () => {
    const root = workspace('1.0.0');
    expect(Object.keys(collectDesktopVersions(root))).toEqual([
      'package.json',
      'apps/desktop/package.json',
      'package-lock.json (apps/desktop)',
      'apps/desktop/src-tauri/tauri.conf.json',
      'apps/desktop/src-tauri/Cargo.toml',
      'apps/desktop/src-tauri/Cargo.lock',
    ]);
  });
});
