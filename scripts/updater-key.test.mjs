import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_PUBLIC_KEY,
  TAURI_CONF,
  assertNotPrivateKey,
  assertUsablePublicKey,
  readEmbeddedPublicKey,
  stampPublicKey,
} from './updater-key.mjs';

function publicKeyFixture() {
  const { publicKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const file = [
    'untrusted comment: minisign public key',
    Buffer.concat([Buffer.from('Ed'), randomBytes(8), raw]).toString('base64'),
    '',
  ].join('\n');
  return Buffer.from(file).toString('base64');
}

function repoFixture(pubkey) {
  const root = mkdtempSync(join(tmpdir(), 'pumpos-key-'));
  mkdirSync(join(root, TAURI_CONF, '..'), { recursive: true });
  writeFileSync(
    join(root, TAURI_CONF),
    `${JSON.stringify({ version: '1.2.3', plugins: { updater: { pubkey } } }, null, 2)}\n`,
  );
  return root;
}

describe('updater public key', () => {
  it('accepts a real minisign public key', () => {
    const pubkey = publicKeyFixture();
    expect(assertUsablePublicKey(pubkey)).toBe(pubkey);
  });

  it('refuses the committed placeholder, so a release cannot ship unverifiable', () => {
    expect(() => assertUsablePublicKey(PLACEHOLDER_PUBLIC_KEY)).toThrow(
      /No PumpOS updater public key is embedded/,
    );
  });

  it('refuses a key that would only fail on a station machine', () => {
    expect(() => assertUsablePublicKey(Buffer.from('nonsense').toString('base64'))).toThrow(
      /not a minisign Ed25519 public key/,
    );
  });

  it('refuses a private key outright', () => {
    const secret = Buffer.from(
      'untrusted comment: minisign encrypted secret key\nRWRTY0Iy...\n',
    ).toString('base64');
    expect(() => assertNotPrivateKey(secret)).toThrow(/That is a minisign SECRET key/);
  });

  it('stamps the public key into the Tauri config without touching anything else', () => {
    const root = repoFixture(PLACEHOLDER_PUBLIC_KEY);
    const pubkey = publicKeyFixture();
    stampPublicKey(root, pubkey);

    const config = JSON.parse(readFileSync(join(root, TAURI_CONF), 'utf8'));
    expect(config.plugins.updater.pubkey).toBe(pubkey);
    expect(config.version).toBe('1.2.3');
    expect(readEmbeddedPublicKey(root)).toBe(pubkey);
  });

  it('never writes a private key into the repository config', () => {
    const root = repoFixture(PLACEHOLDER_PUBLIC_KEY);
    const secret = Buffer.from('untrusted comment: minisign secret key\nRWRTY0=\n').toString(
      'base64',
    );
    expect(() => stampPublicKey(root, secret)).toThrow(/SECRET key/);
    expect(readEmbeddedPublicKey(root)).toBe(PLACEHOLDER_PUBLIC_KEY);
  });
});
