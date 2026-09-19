import { generateKeyPairSync, randomBytes, sign as signBuffer } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findSignedArtifacts,
  parsePublicKey,
  verifyUpdaterSignature,
} from './verify-updater-signature.mjs';

/**
 * These fixtures reproduce minisign's wire format exactly — a 42-byte public
 * key and a 74-byte signature, each wrapped in a commented file and then
 * base64-encoded the way Tauri stores them. Getting that layout wrong is
 * precisely the bug this script exists to catch, so the test builds it by hand
 * rather than trusting the implementation's own encoder.
 */
function minisignKeyPair(keyId = randomBytes(8)) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);

  const publicFile = [
    'untrusted comment: minisign public key',
    Buffer.concat([Buffer.from('Ed'), keyId, rawPublic]).toString('base64'),
    '',
  ].join('\n');

  return {
    keyId,
    pubkey: Buffer.from(publicFile).toString('base64'),
    sign(artifact, signingKeyId = keyId) {
      const signature = signBuffer(null, artifact, privateKey);
      const file = [
        'untrusted comment: signature from tauri secret key',
        Buffer.concat([Buffer.from('Ed'), signingKeyId, signature]).toString('base64'),
        'trusted comment: timestamp:1767225600\tfile:PumpOS.app.tar.gz',
        randomBytes(64).toString('base64'),
        '',
      ].join('\n');
      return Buffer.from(file).toString('base64');
    },
  };
}

describe('updater signature verification', () => {
  it('accepts an artifact signed with the embedded key', () => {
    const keys = minisignKeyPair();
    const artifact = Buffer.from('PumpOS.app.tar.gz contents');
    expect(
      verifyUpdaterSignature({ artifact, signature: keys.sign(artifact), pubkey: keys.pubkey }),
    ).toBe(true);
  });

  it('rejects an artifact that was modified after signing', () => {
    const keys = minisignKeyPair();
    const signature = keys.sign(Buffer.from('original'));
    expect(
      verifyUpdaterSignature({ artifact: Buffer.from('tampered'), signature, pubkey: keys.pubkey }),
    ).toBe(false);
  });

  it('rejects a signature from a different PumpOS key, naming both key ids', () => {
    // This is what "we rotated the updater key without shipping the rotation
    // release first" looks like: structurally valid, universally rejected.
    const shipped = minisignKeyPair();
    const other = minisignKeyPair();
    const artifact = Buffer.from('PumpOS.app.tar.gz contents');
    expect(() =>
      verifyUpdaterSignature({
        artifact,
        signature: other.sign(artifact),
        pubkey: shipped.pubkey,
      }),
    ).toThrow(/signature was produced by key/);
  });

  it('refuses a malformed public key rather than silently passing', () => {
    expect(() => parsePublicKey(Buffer.from('not a key').toString('base64'))).toThrow(
      /public key must be 42 bytes/,
    );
  });

  it('refuses an unsupported signature algorithm', () => {
    const bytes = Buffer.concat([Buffer.from('ED'), randomBytes(40)]);
    expect(() => parsePublicKey(bytes.toString('base64'))).toThrow(
      /unsupported signature algorithm/,
    );
  });

  it('finds exactly the artifacts that carry a sibling .sig', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pumpos-updater-'));
    writeFileSync(join(dir, 'PumpOS.app.tar.gz'), 'mac');
    writeFileSync(join(dir, 'PumpOS.app.tar.gz.sig'), 'sig');
    writeFileSync(join(dir, 'PumpOS_1.2.3_x64-setup.exe'), 'win');
    writeFileSync(join(dir, 'PumpOS_1.2.3_x64-setup.exe.sig'), 'sig');
    // An unsigned human-installable download is not an updater artifact.
    writeFileSync(join(dir, 'PumpOS_1.2.3_universal.dmg'), 'dmg');

    expect(findSignedArtifacts(dir).map((p) => p.artifact.replace(`${dir}/`, ''))).toEqual([
      'PumpOS.app.tar.gz',
      'PumpOS_1.2.3_x64-setup.exe',
    ]);
  });
});
