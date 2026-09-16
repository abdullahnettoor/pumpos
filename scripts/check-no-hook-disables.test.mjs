import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-no-hook-disables.mjs');

/**
 * The script walks the real `packages/` and `apps/` trees, so these write a
 * throwaway file into one of them and clean it up. Running it against the repo
 * as it stands is also the point: the first case fails if anyone reintroduces a
 * disable, which is the guard doing its job.
 */
const PROBE_DIR = join(ROOT, 'packages', 'ui', 'src', '__guard_probe__');

afterEach(() => {
  rmSync(PROBE_DIR, { recursive: true, force: true });
});

function run() {
  const result = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: ROOT });
  return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function probe(contents, name = 'probe.tsx') {
  mkdirSync(PROBE_DIR, { recursive: true });
  writeFileSync(join(PROBE_DIR, name), contents);
}

describe('check-no-hook-disables', () => {
  it('passes on the repository as it stands', () => {
    expect(run().code).toBe(0);
  });

  it('fails on an inline react-hooks disable, naming the file and line', () => {
    probe('// eslint-disable-next-line react-hooks/exhaustive-deps\nexport const a = 1;\n');
    const { code, output } = run();
    expect(code).toBe(1);
    expect(output).toContain('probe.tsx:1');
    expect(output).toContain('react-hooks/exhaustive-deps');
  });

  it('catches the block form as well as the next-line form', () => {
    probe('/* eslint-disable react-hooks/set-state-in-effect */\nexport const a = 1;\n');
    expect(run().code).toBe(1);
  });

  it('catches a disable placed at the end of a line', () => {
    probe('export const a = 1; // eslint-disable-line react-hooks/exhaustive-deps\n');
    expect(run().code).toBe(1);
  });

  it('ignores disables for other rules, which the ratchet can still see', () => {
    // Only react-hooks disables bypass the suppressions file; the rest are
    // ordinary suppressions and not this script's business.
    probe('// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const a = 1;\n');
    expect(run().code).toBe(0);
  });

  it('points at the supported way to record a violation', () => {
    probe('// eslint-disable-next-line react-hooks/exhaustive-deps\nexport const a = 1;\n');
    expect(run().output).toContain('lint:baseline');
  });
});
