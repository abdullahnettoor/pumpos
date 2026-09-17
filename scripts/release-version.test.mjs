import { describe, expect, it } from 'vitest';
import { classifyCommit, highestBump, incrementVersion, releaseBump } from './release-version.mjs';

describe('release version derivation', () => {
  it.each([
    ['feat: add fleet limits', 'minor'],
    ['feat(crm)!: replace balance rules', 'major'],
    ['fix: reconcile cash drops', 'patch'],
    ['perf(api): reduce ledger queries', 'patch'],
    ['docs: explain releases', 'none'],
    ['refactor: split repository', 'none'],
    ['feat: compatible subject\n\nBREAKING CHANGE: remove old endpoint', 'major'],
  ])('classifies %s as %s', (commit, expected) => {
    expect(classifyCommit(commit)).toBe(expected);
  });

  it('uses the highest bump in a release', () => {
    expect(highestBump(['fix: one', 'feat: two', 'perf: three'])).toBe('minor');
  });

  it('creates a patch release when a main promotion has no release commit type', () => {
    expect(releaseBump(['docs: explain releases', 'chore: update tooling'])).toBe('patch');
  });

  it('does not invent a release for an empty range', () => {
    expect(releaseBump([])).toBe('none');
  });

  it('increments from the latest tag rather than a manifest version', () => {
    expect(incrementVersion('1.4.9', 'patch')).toBe('1.4.10');
    expect(incrementVersion('1.4.9', 'minor')).toBe('1.5.0');
    expect(incrementVersion('1.4.9', 'major')).toBe('2.0.0');
    expect(incrementVersion('1.4.9', 'none')).toBe('1.4.9');
  });
});
