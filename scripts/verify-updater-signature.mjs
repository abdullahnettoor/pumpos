#!/usr/bin/env node
/**
 * Verify a Tauri updater signature against the public key embedded in the app.
 *
 * Tauri signs updater artifacts with minisign (Ed25519). The private half lives
 * only in a protected GitHub environment; the public half is compiled into every
 * PumpOS desktop build. CI runs this before anything is uploaded, so a release
 * can never carry an artifact that installed clients would refuse — a failure
 * found here costs a re-run, the same failure found in the field strands every
 * installation on the previous version.
 *
 * This is NOT operating-system signing. Passing here says "installed PumpOS
 * clients will accept this update". It says nothing to macOS Gatekeeper or
 * Windows SmartScreen, which PumpOS has no credentials for in phase one.
 *
 * Usage:
 *   node scripts/verify-updater-signature.mjs <artifact> [<artifact.sig>]
 *   node scripts/verify-updater-signature.mjs --dir <bundle-dir>
 *
 * The public key is read from apps/desktop/src-tauri/tauri.conf.json, or from
 * TAURI_SIGNING_PUBLIC_KEY when set.
 */
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEmbeddedPublicKey } from './updater-key.mjs';

/** Minisign's legacy Ed25519 algorithm — what Tauri emits. */
const ALGORITHM_ED = 'Ed';
/** DER prefix that turns 32 raw Ed25519 bytes into an SPKI key Node accepts. */
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Minisign keys and signatures reach us base64-encoded twice: Tauri stores the
 * whole minisign *file* as base64. Decode that outer layer, then take the one
 * line that is not a comment.
 */
export function decodeMinisignBlock(value) {
  const raw = Buffer.from(String(value).trim(), 'base64').toString('utf8');
  const text = /comment|^[A-Za-z]/.test(raw) && raw.includes('\n') ? raw : String(value).trim();
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 && !l.startsWith('untrusted comment:') && !l.startsWith('trusted comment:'),
    )
    .shift();
  if (!line) throw new Error('minisign block contains no key or signature line');
  return Buffer.from(line, 'base64');
}

export function parsePublicKey(pubkey) {
  const bytes = decodeMinisignBlock(pubkey);
  if (bytes.length !== 42) {
    throw new Error(`public key must be 42 bytes, got ${bytes.length}`);
  }
  const algorithm = bytes.subarray(0, 2).toString('utf8');
  if (algorithm !== ALGORITHM_ED) {
    throw new Error(`unsupported signature algorithm "${algorithm}" (expected ${ALGORITHM_ED})`);
  }
  return { keyId: bytes.subarray(2, 10), key: bytes.subarray(10, 42) };
}

export function parseSignature(signature) {
  const bytes = decodeMinisignBlock(signature);
  if (bytes.length !== 74) {
    throw new Error(`signature must be 74 bytes, got ${bytes.length}`);
  }
  const algorithm = bytes.subarray(0, 2).toString('utf8');
  if (algorithm !== ALGORITHM_ED) {
    throw new Error(`unsupported signature algorithm "${algorithm}" (expected ${ALGORITHM_ED})`);
  }
  return { keyId: bytes.subarray(2, 10), signature: bytes.subarray(10, 74) };
}

/**
 * True when `artifact` was signed by the holder of `pubkey`.
 *
 * The key id is compared first: a mismatch means the artifact was signed with a
 * *different* PumpOS key, which is the exact shape of "we rotated the key and
 * forgot to ship the rotation release first".
 */
export function verifyUpdaterSignature({ artifact, signature, pubkey }) {
  const parsedKey = parsePublicKey(pubkey);
  const parsedSignature = parseSignature(signature);
  if (!parsedKey.keyId.equals(parsedSignature.keyId)) {
    throw new Error(
      `signature was produced by key ${parsedSignature.keyId.toString('hex')}, ` +
        `but the app embeds ${parsedKey.keyId.toString('hex')}`,
    );
  }
  const key = createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, parsedKey.key]),
    format: 'der',
    type: 'spki',
  });
  return verifySignature(null, artifact, key, parsedSignature.signature);
}

/** Every `<artifact>` that has a sibling `<artifact>.sig`, in one directory. */
export function findSignedArtifacts(dir) {
  const names = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
  const signatures = new Set(names.filter((name) => name.endsWith('.sig')));
  return names
    .filter((name) => !name.endsWith('.sig') && signatures.has(`${name}.sig`))
    .sort()
    .map((name) => ({ artifact: join(dir, name), signature: join(dir, `${name}.sig`) }));
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pubkey = process.env.TAURI_SIGNING_PUBLIC_KEY || readEmbeddedPublicKey(root);

  const pairs =
    argv[0] === '--dir'
      ? findSignedArtifacts(resolve(argv[1]))
      : [{ artifact: resolve(argv[0]), signature: resolve(argv[1] ?? `${argv[0]}.sig`) }];

  if (pairs.length === 0) {
    throw new Error('no signed updater artifacts found — the build produced nothing to verify');
  }

  for (const pair of pairs) {
    const ok = verifyUpdaterSignature({
      artifact: readFileSync(pair.artifact),
      signature: readFileSync(pair.signature, 'utf8'),
      pubkey,
    });
    if (!ok) throw new Error(`signature does not match ${pair.artifact}`);
    console.log(`  verified  ${pair.artifact}`);
  }
  console.log(`\n${pairs.length} updater artifact(s) verified against the embedded public key.`);
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Updater signature verification failed: ${error.message}`);
    process.exit(1);
  }
}
