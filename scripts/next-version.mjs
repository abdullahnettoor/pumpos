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
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const rangeArg = args.includes('--range') ? args[args.indexOf('--range') + 1] : null;

const git = (cmd) => execSync(`git ${cmd}`, { cwd: root }).toString().trim();

const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

/** The last release tag, or the empty tree if this repo has never released. */
function defaultRange() {
  try {
    const lastTag = git('describe --tags --abbrev=0 --match "v*.*.*"');
    return `${lastTag}..HEAD`;
  } catch {
    return 'HEAD';
  }
}

const range = rangeArg || defaultRange();

// %s subject, %b body, separated by a record marker so multi-line bodies
// cannot be mistaken for new commits. (A literal NUL cannot be passed through
// execSync's command string, so use a printable sentinel.)
const RECORD = '@@COMMIT@@';
const raw = git(`log ${range} --no-merges --pretty=format:%s%n%b${RECORD}`);
const commits = raw
  .split(RECORD)
  .map((c) => c.trim())
  .filter(Boolean);

const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

function classify(commit) {
  const [subject, ...bodyLines] = commit.split('\n');
  const body = bodyLines.join('\n');
  // `type(scope)!: summary` — the `!` is the breaking-change marker.
  const match = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
  if (match?.[3] || /^BREAKING[ -]CHANGE:/m.test(body)) return 'major';
  const type = match?.[1];
  if (type === 'feat') return 'minor';
  if (type === 'fix' || type === 'perf') return 'patch';
  return 'none';
}

const bump = commits.reduce((highest, commit) => {
  const kind = classify(commit);
  return RANK[kind] > RANK[highest] ? kind : highest;
}, 'none');

function nextVersion(cur, kind) {
  const [maj, min, pat] = cur.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  return cur;
}

const version = nextVersion(current, bump);

if (asJson) {
  console.log(JSON.stringify({ current, bump, version, range, commits: commits.length }));
} else {
  console.log(`range    ${range}`);
  console.log(`commits  ${commits.length}`);
  console.log(`current  ${current}`);
  console.log(`bump     ${bump}`);
  console.log(`version  ${bump === 'none' ? '(no release)' : version}`);
}
