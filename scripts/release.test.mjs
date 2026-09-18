import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stampReleaseVersion } from './release.mjs';

function write(root, path, contents) {
  const file = join(root, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, contents);
}

describe('release manifest stamping', () => {
  it('stamps package and Tauri manifests without Git operations', () => {
    const root = mkdtempSync(join(tmpdir(), 'pumpos-release-'));
    write(root, 'package.json', '{"name":"root","version":"0.0.0"}\n');
    write(root, 'apps/api/package.json', '{"name":"api","version":"0.0.0"}\n');
    write(
      root,
      'package-lock.json',
      '{"version":"0.0.0","packages":{"":{"version":"0.0.0"},"apps/api":{"version":"0.0.0"}}}\n',
    );
    write(root, 'apps/desktop/src-tauri/tauri.conf.json', '{"version":"0.0.0"}\n');
    write(root, 'apps/desktop/src-tauri/Cargo.toml', '[package]\nversion = "0.0.0"\n');
    write(
      root,
      'apps/desktop/src-tauri/Cargo.lock',
      '[[package]]\nname = "pumpos"\nversion = "0.0.0"\n',
    );

    stampReleaseVersion(root, '2.4.1', () => {});

    expect(JSON.parse(readFileSync(join(root, 'package.json'))).version).toBe('2.4.1');
    expect(JSON.parse(readFileSync(join(root, 'apps/api/package.json'))).version).toBe('2.4.1');
    expect(JSON.parse(readFileSync(join(root, 'package-lock.json'))).packages[''].version).toBe(
      '2.4.1',
    );
    expect(
      JSON.parse(readFileSync(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'))
        .version,
    ).toBe('2.4.1');
    expect(readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.toml'), 'utf8')).toContain(
      'version = "2.4.1"',
    );
    expect(readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.lock'), 'utf8')).toContain(
      'version = "2.4.1"',
    );
  });

  it('rejects an invalid version', () => {
    expect(() => stampReleaseVersion('/tmp/unused', 'latest', () => {})).toThrow(
      'Version must be X.Y.Z',
    );
  });

  it('accepts a Cargo lock that already has the release version', () => {
    const root = mkdtempSync(join(tmpdir(), 'pumpos-release-'));
    const cargoLock = '[[package]]\nname = "pumpos"\nversion = "1.0.0"\n';
    write(root, 'apps/desktop/src-tauri/Cargo.lock', cargoLock);

    expect(() => stampReleaseVersion(root, '1.0.0', () => {})).not.toThrow();
    expect(readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.lock'), 'utf8')).toBe(cargoLock);
  });

  it('stamps a CRLF Cargo lock and keeps its line endings', () => {
    const root = mkdtempSync(join(tmpdir(), 'pumpos-release-'));
    write(
      root,
      'apps/desktop/src-tauri/Cargo.lock',
      '[[package]]\r\nname = "pumpos"\r\nversion = "0.0.0"\r\n',
    );

    stampReleaseVersion(root, '2.4.1', () => {});

    expect(readFileSync(join(root, 'apps/desktop/src-tauri/Cargo.lock'), 'utf8')).toBe(
      '[[package]]\r\nname = "pumpos"\r\nversion = "2.4.1"\r\n',
    );
  });

  it('rejects a Cargo lock without the PumpOS package', () => {
    const root = mkdtempSync(join(tmpdir(), 'pumpos-release-'));
    write(root, 'apps/desktop/src-tauri/Cargo.lock', '[[package]]\nname = "dependency"\n');

    expect(() => stampReleaseVersion(root, '1.0.0', () => {})).toThrow(
      'could not find pumpos package',
    );
  });
});
