#!/usr/bin/env node
/**
 * Derive the next release version from what was actually merged.
 *
 * The version used to be a remembered manual step, with two quiet failure
 * modes: forget to bump and the merge to `main` silently no-ops (the tag
 * already exists), or run the release script and push tags first and the
 * workflow skips for the opposite reason. Either way, nothing ships and nothing
 * says so.
 *
 * So the bump is read off the commit subjects since the last release tag,
 * Conventional-Commits style:
 *
 *   major   a `!` before the colon (`feat!:`), or `BREAKING CHANGE` in the body
 *   minor   `feat:`
 *   patch   `fix:` or `perf:`
 *   none    everything else — docs, ci, test, chore, style, refactor
 *
 * "none" is a real answer: a PR that only touches CI or docs is not a release,
 * and inventing a version for it would put a pointless build in front of the
 * approval gate.
 *
 * Usage:
 *   node scripts/next-version.mjs                 # human-readable
 *   node scripts/next-version.mjs --json          # { current, bump, version }
 *   node scripts/next-version.mjs --range a..b    # explicit commit range
 *   node scripts/next-version.mjs --base 1.2.0    # version to bump from
 *   node scripts/next-version.mjs --initial 1.0.0 # first version when no tag exists
 *
 * `--base` is the version the bump applies on top of. Without it, the latest
 * vX.Y.Z tag is the base. The committed package version is only a development
 * fallback for repositories that do not have a release tag yet.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { incrementVersion, releaseBump } from './release-version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rangeArg = args.includes('--range') ? args[args.indexOf('--range') + 1] : null;
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
const initialArg = args.includes('--initial') ? args[args.indexOf('--initial') + 1] : null;

const git = (cmd) => execSync(`git ${cmd}`, { cwd: root }).toString().trim();

const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

/** The last release tag, or HEAD when this repo has never released. */
function latestReleaseTag() {
  try {
    return git('describe --tags --abbrev=0 --match "v*.*.*"');
  } catch {
    return null;
  }
}

const latestTag = latestReleaseTag();
const range = rangeArg || (latestTag ? `${latestTag}..HEAD` : 'HEAD');
const base = baseArg || latestTag?.slice(1) || current;

// %s subject, %b body, separated by a record marker so multi-line bodies
// cannot be mistaken for new commits. (A literal NUL cannot be passed through
// execSync's command string, so use a printable sentinel.)
const RECORD = '@@COMMIT@@';
const raw = git(`log ${range} --no-merges --pretty=format:%s%n%b${RECORD}`);
const commits = raw
  .split(RECORD)
  .map((c) => c.trim())
  .filter(Boolean);

const bump = releaseBump(commits);
const version =
  bump === 'none'
    ? base
    : !latestTag && !baseArg && initialArg
      ? initialArg
      : incrementVersion(base, bump);

if (asJson) {
  console.log(JSON.stringify({ current, base, bump, version, range, commits: commits.length }));
} else {
  console.log(`range    ${range}`);
  console.log(`commits  ${commits.length}`);
  console.log(`base     ${base}`);
  console.log(`current  ${current}`);
  console.log(`bump     ${bump}`);
  console.log(`version  ${bump === 'none' ? '(no release)' : version}`);
}
