import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-suppressions-not-grown.mjs');

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'suppressions-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** @param {string} name @param {unknown} contents */
function file(name, contents) {
  const path = join(dir, name);
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return path;
}

/**
 * Runs the guard and reports what CI would see: the exit code, and both streams
 * combined — the failure detail goes to stderr, so checking stdout alone would
 * make these assertions pass against a silent script.
 */
function run(...args) {
  const result = spawnSync('node', [SCRIPT, ...args.filter((a) => a !== undefined)], {
    encoding: 'utf8',
  });
  return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const withCounts = (entries) =>
  Object.fromEntries(
    Object.entries(entries).map(([f, rules]) => [
      f,
      Object.fromEntries(Object.entries(rules).map(([r, c]) => [r, { count: c }])),
    ]),
  );

describe('check-suppressions-not-grown', () => {
  it('fails when the baseline grows', () => {
    // The #78 bypass: suppress the violation, commit, build goes green.
    const base = file('base.json', {});
    const head = file('head.json', withCounts({ 'a.tsx': { 'react-hooks/exhaustive-deps': 1 } }));
    const { code, output } = run(base, head);
    expect(code).toBe(1);
    expect(output).toContain('0 -> 1');
    expect(output).toContain('a.tsx');
    expect(output).toContain('react-hooks/exhaustive-deps');
  });

  it('names every entry that grew, not just the total', () => {
    const base = file('base.json', withCounts({ 'a.tsx': { r1: 1 } }));
    const head = file('head.json', withCounts({ 'a.tsx': { r1: 4 }, 'b.tsx': { r2: 2 } }));
    const { code, output } = run(base, head);
    expect(code).toBe(1);
    expect(output).toContain('a.tsx');
    expect(output).toContain('1 -> 4');
    expect(output).toContain('b.tsx');
  });

  it('passes when the baseline shrinks', () => {
    const base = file('base.json', withCounts({ 'a.tsx': { r1: 3 } }));
    const head = file('head.json', withCounts({ 'a.tsx': { r1: 1 } }));
    const { code, output } = run(base, head);
    expect(code).toBe(0);
    expect(output).toContain('shrank');
  });

  it('passes when the baseline is unchanged', () => {
    const same = withCounts({ 'a.tsx': { r1: 2 } });
    const { code } = run(file('base.json', same), file('head.json', same));
    expect(code).toBe(0);
  });

  it('passes when a suppression moves between files without growing the total', () => {
    // Fixing one violation and legitimately recording another elsewhere is not
    // a regression, so comparing file contents would be too strict.
    const base = file('base.json', withCounts({ 'a.tsx': { r1: 3 }, 'b.tsx': { r1: 1 } }));
    const head = file('head.json', withCounts({ 'a.tsx': { r1: 1 }, 'b.tsx': { r1: 3 } }));
    const { code, output } = run(base, head);
    expect(code).toBe(0);
    expect(output).toContain('moved');
  });

  it('still fails on a net increase spread across several files', () => {
    const base = file('base.json', withCounts({ 'a.tsx': { r1: 3 }, 'b.tsx': { r1: 1 } }));
    const head = file('head.json', withCounts({ 'a.tsx': { r1: 2 }, 'b.tsx': { r1: 3 } }));
    expect(run(base, head).code).toBe(1);
  });

  describe('the deliberate escape hatch', () => {
    it('allows growth and says so', () => {
      const base = file('base.json', {});
      const head = file('head.json', withCounts({ 'a.tsx': { r1: 1 } }));
      const { code, output } = run(base, head, '--allow-growth');
      expect(code).toBe(0);
      expect(output).toContain('[ratchet]');
      // The increase must still be reported, or marking a PR becomes a way to
      // grow the baseline invisibly.
      expect(output).toContain('0 -> 1');
    });
  });

  describe('bad input', () => {
    it('treats a missing base file as empty rather than crashing', () => {
      // First run, or the file having been deleted.
      const { code } = run(join(dir, 'nope.json'), file('head.json', {}));
      expect(code).toBe(0);
    });

    it('exits distinctly on unparseable JSON, so it is not read as a pass', () => {
      const { code, output } = run(file('base.json', 'not json'), file('head.json', {}));
      expect(code).toBe(2);
      expect(output).toContain('Could not parse');
    });

    it('exits distinctly when called without arguments', () => {
      expect(run().code).toBe(2);
    });
  });
});
