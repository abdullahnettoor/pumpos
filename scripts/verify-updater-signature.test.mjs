import { createHash, generateKeyPairSync, randomBytes, sign as signBuffer } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeMinisignBlock,
  findSignedArtifacts,
  parsePublicKey,
  parseSignature,
  verifyUpdaterSignature,
} from './verify-updater-signature.mjs';

/**
 * These fixtures reproduce minisign's wire format exactly — a 42-byte public
 * key and a 74-byte signature, each wrapped in a commented file and then
 * base64-encoded the way Tauri stores them. Getting that layout wrong is
 * precisely the bug this script exists to catch, so the test builds it by hand
 * rather than trusting the implementation's own encoder.
 */
function minisignKeyPair(keyId = randomBytes(8), algorithm = 'ED') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);

  // The public key is always tagged 'Ed' — it is the same Ed25519 key whichever
  // way a given signature was produced.
  const publicFile = [
    'untrusted comment: minisign public key',
    Buffer.concat([Buffer.from('Ed'), keyId, rawPublic]).toString('base64'),
    '',
  ].join('\n');

  return {
    keyId,
    pubkey: Buffer.from(publicFile).toString('base64'),
    sign(artifact, signingKeyId = keyId) {
      // 'ED' is prehashed: the signed message is BLAKE2b-512 of the file.
      const message =
        algorithm === 'ED' ? createHash('blake2b512').update(artifact).digest() : artifact;
      const signature = signBuffer(null, message, privateKey);
      const file = [
        'untrusted comment: signature from tauri secret key',
        Buffer.concat([Buffer.from(algorithm), signingKeyId, signature]).toString('base64'),
        'trusted comment: timestamp:1767225600\tfile:PumpOS.app.tar.gz',
        randomBytes(64).toString('base64'),
        '',
      ].join('\n');
      return Buffer.from(file).toString('base64');
    },
  };
}

describe('updater signature verification', () => {
  it.each(['ED', 'Ed'])('accepts an artifact signed with the embedded key (%s)', (algorithm) => {
    const keys = minisignKeyPair(randomBytes(8), algorithm);
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

  it('refuses an unsupported public key algorithm', () => {
    // 'ED' is a legitimate *signature* algorithm but never a public-key one:
    // the key is the same Ed25519 key either way.
    const bytes = Buffer.concat([Buffer.from('ED'), randomBytes(40)]);
    expect(() => parsePublicKey(bytes.toString('base64'))).toThrow(
      /unsupported public key algorithm/,
    );
  });

  it('refuses a signature algorithm minisign does not define', () => {
    // Deterministic filler, not random: an earlier version of this test used
    // randomBytes, and the decoded form occasionally looked enough like a
    // minisign file to take a different code path. It passed locally and failed
    // on CI.
    const bytes = Buffer.concat([Buffer.from('eD'), Buffer.alloc(72, 0x41)]);
    expect(() => parseSignature(bytes.toString('base64'))).toThrow(
      /unsupported signature algorithm "eD" \(expected Ed or ED\)/,
    );
  });

  it('reads a bare base64 blob whose decoded bytes happen to look like text', () => {
    // The regression behind the CI flake: `AAAA…` decodes to printable ASCII
    // with newlines in it, which a "does this look like a file?" heuristic
    // reads as a minisign file. Only the `untrusted comment:` marker decides.
    const bytes = Buffer.concat([Buffer.from('Ed'), Buffer.alloc(40, 0x0a)]);
    expect(decodeMinisignBlock(bytes.toString('base64'))).toEqual(bytes);
  });

  it('rejects an empty block instead of decoding nothing', () => {
    expect(() => decodeMinisignBlock('   ')).toThrow(/minisign block is empty/);
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

/**
 * The test that would have caught the release failure.
 *
 * The hand-built fixtures above can only prove this module agrees with itself:
 * the first version of it understood only minisign's legacy `Ed` algorithm, and
 * the tests obligingly produced `Ed` signatures. Tauri emits prehashed `ED`, so
 * the release gate rejected every genuine artifact — and nothing said so until
 * a macOS runner had finished a full build.
 *
 * These bytes came out of a real `tauri signer` run. See the fixture README.
 */
describe('a real Tauri signature', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/updater');
  const artifact = readFileSync(join(dir, 'artifact.bin'));
  const signature = readFileSync(join(dir, 'artifact.bin.sig'), 'utf8');
  const pubkey = readFileSync(join(dir, 'throwaway.key.pub'), 'utf8');

  it('is what Tauri actually produces: prehashed ED against an Ed public key', () => {
    expect(parseSignature(signature).algorithm).toBe('ED');
    expect(parsePublicKey(pubkey).keyId).toEqual(parseSignature(signature).keyId);
  });

  it('verifies against the matching public key', () => {
    expect(verifyUpdaterSignature({ artifact, signature, pubkey })).toBe(true);
  });

  it('rejects the same signature over different bytes', () => {
    expect(verifyUpdaterSignature({ artifact: Buffer.from('tampered'), signature, pubkey })).toBe(
      false,
    );
  });
});
