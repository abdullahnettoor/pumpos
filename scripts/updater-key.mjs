#!/usr/bin/env node
/**
 * The PumpOS updater public key: read it, validate it, stamp it.
 *
 * The key pair is generated once, by the repository owner, on their own
 * machine. The private half goes into a protected GitHub environment and an
 * encrypted backup kept outside GitHub; it never enters the repository, a log,
 * or this script. The public half is embedded in every desktop build — it is
 * the only thing that lets an installed PumpOS reject an artifact that PumpOS
 * did not sign.
 *
 * See docs/desktop-updates.md for the full runbook, including what losing the
 * private key costs (every installed client stops accepting updates).
 *
 * Usage:
 *   node scripts/updater-key.mjs --check          # fail if no real key is embedded
 *   node scripts/updater-key.mjs --stamp          # write TAURI_SIGNING_PUBLIC_KEY into the config
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAURI_CONF = 'apps/desktop/src-tauri/tauri.conf.json';

/**
 * The committed config ships this rather than a real key so that a fork, or a
 * checkout made before the owner generated the key pair, still builds and still
 * fails loudly at release time instead of shipping an unverifiable updater.
 */
export const PLACEHOLDER_PUBLIC_KEY = 'REPLACE_WITH_PUMPOS_UPDATER_PUBLIC_KEY';

export function readEmbeddedPublicKey(root) {
  const config = JSON.parse(readFileSync(join(root, TAURI_CONF), 'utf8'));
  const pubkey = config?.plugins?.updater?.pubkey;
  if (typeof pubkey !== 'string' || pubkey.length === 0) {
    throw new Error(`${TAURI_CONF} has no plugins.updater.pubkey`);
  }
  return pubkey;
}

/**
 * A minisign public key, base64-encoded by Tauri. Anything that does not decode
 * to 42 bytes starting with "Ed" would be accepted by the JSON schema and then
 * fail at install time on a station's machine, which is the worst possible
 * place to find out.
 */
export function assertUsablePublicKey(pubkey) {
  if (!pubkey || pubkey === PLACEHOLDER_PUBLIC_KEY) {
    throw new Error(
      'No PumpOS updater public key is embedded. Generate the key pair and stamp it ' +
        '(see docs/desktop-updates.md) before cutting a release.',
    );
  }
  let decoded;
  try {
    decoded = Buffer.from(pubkey.trim(), 'base64').toString('utf8');
  } catch {
    throw new Error('updater public key is not valid base64');
  }
  const line = decoded
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('untrusted comment:'));
  const bytes = Buffer.from(line ?? '', 'base64');
  if (bytes.length !== 42 || bytes.subarray(0, 2).toString('utf8') !== 'Ed') {
    throw new Error('updater public key is not a minisign Ed25519 public key');
  }
  return pubkey.trim();
}

/** Refuse anything that even looks like the private half. */
export function assertNotPrivateKey(value) {
  const decoded = Buffer.from(String(value).trim(), 'base64').toString('utf8');
  if (/secret key|minisign encrypted secret key/i.test(decoded)) {
    throw new Error(
      'That is a minisign SECRET key. The private key belongs in a protected GitHub ' +
        'environment secret and an encrypted off-GitHub backup, never in this repository.',
    );
  }
}

export function stampPublicKey(root, pubkey) {
  assertNotPrivateKey(pubkey);
  const validated = assertUsablePublicKey(pubkey);
  const file = join(root, TAURI_CONF);
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.plugins = config.plugins ?? {};
  config.plugins.updater = { ...(config.plugins.updater ?? {}), pubkey: validated };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return validated;
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  if (argv.includes('--stamp')) {
    const pubkey = process.env.TAURI_SIGNING_PUBLIC_KEY;
    if (!pubkey) throw new Error('TAURI_SIGNING_PUBLIC_KEY is not set');
    stampPublicKey(root, pubkey);
    // Deliberately not echoed: public keys are safe to print, but keeping the
    // habit of never printing key material makes a private-key slip impossible.
    console.log(`Stamped the updater public key into ${TAURI_CONF}.`);
    return;
  }
  assertUsablePublicKey(readEmbeddedPublicKey(root));
  console.log('A usable PumpOS updater public key is embedded.');
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
