const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

export function classifyCommit(commit) {
  const [subject, ...bodyLines] = commit.split('\n');
  const body = bodyLines.join('\n');
  const match = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
  if (match?.[3] || /^BREAKING[ -]CHANGE:/m.test(body)) return 'major';
  const type = match?.[1];
  if (type === 'feat') return 'minor';
  if (type === 'fix' || type === 'perf') return 'patch';
  return 'none';
}

export function highestBump(commits) {
  return commits.reduce((highest, commit) => {
    const kind = classifyCommit(commit);
    return RANK[kind] > RANK[highest] ? kind : highest;
  }, 'none');
}

export function releaseBump(commits) {
  const bump = highestBump(commits);
  return bump === 'none' ? 'patch' : bump;
}

export function incrementVersion(version, bump) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return version;
}
