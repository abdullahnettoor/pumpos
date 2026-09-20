#!/usr/bin/env node
/**
 * Generate and validate `latest.json` — the manifest installed PumpOS clients
 * poll on the stable channel.
 *
 * Every field here is load-bearing at a station's machine: a wrong version
 * offers an update nobody can install, a wrong URL fails the download, and a
 * signature *path* where the signature *contents* belong makes the updater
 * reject an otherwise valid release. None of that is visible until an operator
 * hits it, so the manifest is generated from the built artifacts and validated
 * before the release leaves draft.
 *
 * Supported targets are exactly macOS universal and Windows x64. Linux is not
 * built, not listed, and not documented.
 *
 * Usage:
 *   node scripts/updater-manifest.mjs --version 1.2.3 --dir <collected-artifacts> \
 *     --base-url https://github.com/<owner>/<repo>/releases/download/v1.2.3 \
 *     [--notes-file NOTES.md] [--pub-date 2026-05-01T00:00:00Z] > latest.json
 *
 * `--notes-file` is the **GitHub Release body**, not the manifest's notes. Only
 * its `## For operators` section reaches a client, cleaned — see
 * `operatorNotes` below.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The platform keys installed clients actually look up.
 *
 * This is NOT a list of the artifacts PumpOS builds — that distinction cost a
 * release. The updater plugin resolves an entry by building
 * `{os}-{arch}-{installer}` then `{os}-{arch}` from the machine it is running
 * on (tauri-plugin-updater, `Updater::get_urls`), so a manifest key is only
 * useful if some real machine asks for it. `darwin-universal` is a *build*
 * flavour; no client ever requests it, which is why v1.3.1 failed on every Mac
 * with "None of the fallback platforms [darwin-aarch64-app, darwin-aarch64]
 * were found".
 *
 * PumpOS ships one universal macOS artifact that runs on both architectures, so
 * both Mac keys point at the same file. `scripts/gen-download-manifest.mjs`
 * already did exactly this for the download page.
 */
export const SUPPORTED_TARGETS = ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64'];

/** Which keys the plugin will try, in order, for a given machine. */
export function clientLookupKeys({ os, arch, installer }) {
  const keys = [];
  if (installer) keys.push(`${os}-${arch}-${installer}`);
  keys.push(`${os}-${arch}`);
  return keys;
}

/**
 * Map a built artifact to every client key it can serve.
 *
 * The macOS artifact is universal, so it serves both Apple Silicon and Intel —
 * one file, two keys. Returning a list rather than a single target is what
 * makes that expressible.
 *
 * Windows deliberately updates through the **NSIS** installer (`-setup.exe`)
 * and not the MSI: a release that listed both would leave the updater picking
 * one and the release notes describing the other. The MSI stays on the release
 * as a human-installable download only.
 */
export function classifyUpdaterAsset(fileName) {
  const name = basename(fileName).toLowerCase();
  if (name.endsWith('.app.tar.gz')) return ['darwin-aarch64', 'darwin-x86_64'];
  if (name.endsWith('-setup.exe') || name.endsWith('.nsis.zip')) return ['windows-x86_64'];
  return [];
}

/**
 * Collect updater assets from a directory of `<artifact>.sig` files.
 *
 * Only the signature files are required: the artifacts themselves are hundreds
 * of megabytes and already uploaded to the draft release by the build jobs, so
 * shipping them between jobs just to name them would be waste. The signature
 * *contents* are read here — never its path, which is the classic way to
 * produce a manifest that validates structurally and fails on every client.
 *
 * An updater artifact present without its `.sig` is still an error: it means a
 * build produced something unsigned that a release might otherwise carry.
 */
export function collectUpdaterAssets(dir, baseUrl) {
  const names = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile());
  const signed = new Set(names.filter((n) => n.endsWith('.sig')).map((n) => n.slice(0, -4)));

  for (const name of names) {
    if (name.endsWith('.sig')) continue;
    if (classifyUpdaterAsset(name).length > 0 && !signed.has(name)) {
      throw new Error(`${name} has no ${name}.sig — the build did not sign it`);
    }
  }

  const assets = [];
  for (const name of [...signed].sort()) {
    const targets = classifyUpdaterAsset(name);
    if (targets.length === 0) continue;
    const signature = readFileSync(join(dir, `${name}.sig`), 'utf8').trim();
    const url = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(name)}`;
    // One artifact, one entry per key it serves. The universal macOS build
    // legitimately appears under both Mac architectures.
    for (const target of targets) assets.push({ target, name, url, signature });
  }
  return assets;
}

/**
 * The heading a release manager writes the operator summary under.
 *
 * It lives in the GitHub Release body rather than a committed file because a
 * PumpOS release adds no commits (see RELEASING.md) and the pipeline already
 * reads that body. Writing the section is the whole release habit.
 */
const OPERATOR_HEADING = /^#{1,6}\s*for operators\s*$/i;
const MARKDOWN_HEADING = /^#{1,6}\s+/;

/** Lines that are developer changelog furniture, never operator content. */
const CHANGELOG_FURNITURE = [/^#{1,6}\s*what'?s changed\s*$/i, /full changelog/i];

/**
 * Conventional-commit prefixes, in two forms, because they carry different
 * risks. `feat(scope):` is unambiguous — no English sentence contains it — so
 * it is stripped wherever it appears. The bare `fix:` form is only stripped at
 * the start of a line or bullet: mid-sentence it is ordinary prose ("what we
 * fix: rounding"), and eating the verb would be worse than leaving the prefix.
 */
const COMMIT_TYPES = 'feat|fix|perf|docs|ci|test|chore|style|refactor|build|revert';
const SCOPED_COMMIT_PREFIX = new RegExp(`\\b(${COMMIT_TYPES})\\([^)]*\\)!?:\\s*`, 'gi');
const COMMIT_PREFIX = new RegExp(`^(${COMMIT_TYPES})!?:\\s*`, 'i');

/**
 * Pull the `## For operators` section out of a GitHub Release body.
 *
 * Everything else on the release — the auto-generated changelog, the compare
 * link, whatever else a human wrote — stays on the Release, where developers
 * read it. No section means no notes, which is the correct outcome: the version
 * and the action alone beat three lines of commit subjects.
 */
export function extractOperatorSummary(body) {
  if (typeof body !== 'string') return '';
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => OPERATOR_HEADING.test(line.trim()));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => MARKDOWN_HEADING.test(line.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/**
 * Clean whatever was written into plain text an operator can read.
 *
 * This runs at the generator rather than the renderer on purpose: stripping
 * here means a stray pull-request link cannot reach a client even when someone
 * hand-writes one into the operators section, and it keeps the desktop shell
 * free of any need to interpret markup at all.
 */
export function normalizeOperatorNotes(raw, maxLength = 4000) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .split('\n')
    .filter((line) => !CHANGELOG_FURNITURE.some((pattern) => pattern.test(line.trim())))
    .map((line) => cleanLine(line))
    .join('\n')
    // Collapse the blank runs that stripping whole lines leaves behind.
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}…` : cleaned;
}

function cleanLine(line) {
  let text = line
    // "… by @user in https://github.com/…" — the whole trailer, not its pieces.
    .replace(/\s+by\s+@[\w-]+\s+in\s+\S+/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // A markdown link keeps its text and loses its destination.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<https?:\/\/[^>]*>/gi, '')
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/\bwww\.\S+/gi, '')
    .replace(/(^|[\s(])@[\w-]+/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(SCOPED_COMMIT_PREFIX, '');

  const bullet = /^(\s*)[-*+]\s+/.exec(text);
  if (bullet) text = `${bullet[1]}- ${text.slice(bullet[0].length)}`;

  const body = bullet ? text.slice(bullet[1].length + 2) : text;
  const stripped = body.replace(COMMIT_PREFIX, '');
  if (stripped !== body) {
    text = bullet ? `${bullet[1]}- ${stripped}` : stripped;
  }
  // Stripping a URL or a mention mid-sentence leaves a double space behind.
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\s+$/, '');
}

/**
 * The one call the pipeline makes: a release body in, operator notes out.
 * Empty is a valid, publishable answer.
 */
export function operatorNotes(releaseBody) {
  return normalizeOperatorNotes(extractOperatorSummary(releaseBody));
}

export function buildUpdaterManifest({ version, notes = '', pubDate, assets }) {
  const platforms = {};
  for (const asset of assets) {
    if (platforms[asset.target] && platforms[asset.target].name !== asset.name) {
      throw new Error(
        `two artifacts claim ${asset.target} (${platforms[asset.target].name} and ${asset.name})`,
      );
    }
    platforms[asset.target] = { signature: asset.signature, url: asset.url, name: asset.name };
  }
  const manifest = {
    version,
    notes,
    pub_date: pubDate ?? new Date().toISOString(),
    platforms: Object.fromEntries(
      SUPPORTED_TARGETS.filter((target) => platforms[target]).map((target) => [
        target,
        { signature: platforms[target].signature, url: platforms[target].url },
      ]),
    ),
  };
  validateUpdaterManifest(manifest, { version });
  return manifest;
}

/**
 * The gate that keeps a broken release in draft.
 *
 * Deliberately strict about things that would only surface on an operator's
 * machine: an unexpected platform key, a missing one, a non-HTTPS URL, a URL
 * for a different version, or a signature that is a file path.
 */
export function validateUpdaterManifest(manifest, { version } = {}) {
  const problems = [];
  if (!/^\d+\.\d+\.\d+$/.test(manifest?.version ?? '')) {
    problems.push(`version "${manifest?.version}" is not a plain X.Y.Z SemVer`);
  }
  if (version && manifest.version !== version) {
    problems.push(`manifest version ${manifest.version} does not match the tag ${version}`);
  }
  if (typeof manifest?.notes !== 'string') problems.push('notes must be a string');
  if (Number.isNaN(Date.parse(manifest?.pub_date ?? ''))) {
    problems.push(`pub_date "${manifest?.pub_date}" is not a date`);
  }

  const targets = Object.keys(manifest?.platforms ?? {});
  for (const target of SUPPORTED_TARGETS) {
    if (!targets.includes(target)) problems.push(`missing required target ${target}`);
  }
  for (const target of targets) {
    if (!SUPPORTED_TARGETS.includes(target)) {
      problems.push(
        `unsupported target ${target} — no PumpOS client asks for it ` +
          `(expected one of ${SUPPORTED_TARGETS.join(', ')})`,
      );
    }
    const entry = manifest.platforms[target];
    // The key must be one this artifact can actually serve. A Windows installer
    // filed under a Mac key would pass every other check here and fail on the
    // operator's machine.
    const name = decodeURIComponent((entry?.url ?? '').split('/').pop() ?? '');
    if (name && !classifyUpdaterAsset(name).includes(target)) {
      problems.push(`${target} points at ${name}, which cannot serve that platform`);
    }
    if (!entry?.url?.startsWith('https://')) {
      problems.push(`${target} url must be HTTPS, got "${entry?.url}"`);
    } else if (manifest.version && !entry.url.includes(manifest.version)) {
      problems.push(`${target} url does not point at v${manifest.version}: ${entry.url}`);
    }
    const signature = entry?.signature;
    if (typeof signature !== 'string' || signature.trim().length === 0) {
      problems.push(`${target} has no signature`);
    } else if (/[\\/]|\.sig$/.test(signature.trim())) {
      problems.push(`${target} signature looks like a file path, not the signature contents`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`latest.json is not publishable:\n  - ${problems.join('\n  - ')}`);
  }
  return manifest;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const version = String(args.version ?? '').replace(/^v/, '');
  if (!args.dir || !args['base-url']) {
    throw new Error('Usage: --version X.Y.Z --dir <artifacts> --base-url <https://...>');
  }
  // The file is the release *body*; only its operator section reaches clients.
  const notes = args['notes-file'] ? operatorNotes(readFileSync(args['notes-file'], 'utf8')) : '';
  const manifest = buildUpdaterManifest({
    version,
    notes,
    pubDate: args['pub-date'],
    assets: collectUpdaterAssets(resolve(args.dir), args['base-url']),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (fileURLToPath(import.meta.url) === (process.argv[1] ? resolve(process.argv[1]) : '')) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
