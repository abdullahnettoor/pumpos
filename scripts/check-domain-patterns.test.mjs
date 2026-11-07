import { describe, it, expect, afterEach } from 'vite-plus/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-domain-patterns.mjs');

let fixture;

afterEach(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
  fixture = undefined;
});

function run(root, ...args) {
  const result = spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...(root ? { DOMAIN_PATTERNS_ROOT: root } : {}) },
  });
  return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function makeRoot(files, baseline) {
  fixture = mkdtempSync(join(tmpdir(), 'domain-patterns-'));
  mkdirSync(join(fixture, 'scripts'), { recursive: true });
  if (baseline) {
    writeFileSync(
      join(fixture, 'scripts', 'domain-patterns-baseline.json'),
      JSON.stringify(baseline),
    );
  }
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    writeFileSync(join(fixture, path), contents);
  }
  return fixture;
}

describe('check-domain-patterns', () => {
  it('passes on the repository as it stands', () => {
    expect(run().code).toBe(0);
  });

  it('fails on a new violation, naming the file, line and the helper to use', () => {
    const root = makeRoot({
      'packages/ui/src/a.tsx': 'const d = new Date().toISOString().slice(0, 10);\n',
    });
    const { code, output } = run(root);
    expect(code).toBe(1);
    expect(output).toContain('[utc-date-slice] packages/ui/src/a.tsx');
    expect(output).toContain('packages/ui/src/a.tsx:1');
    expect(output).toContain('resolveBusinessDate');
  });

  it('flags each UI rule', () => {
    const root = makeRoot({
      'apps/mobile/src/a.tsx': [
        "if (role === 'Manager') {}",
        'await invalidateOperational(id);',
        "useQuery({ queryKey: ['vehicles'] });",
        'x.toFixed(2);',
      ].join('\n'),
      'apps/api/src/routes/r.ts': 'const STATUS_BY_CODE = {};\n',
    });
    const { output } = run(root);
    for (const id of [
      'role-literal',
      'awaited-invalidation',
      'inline-query-key',
      'local-format',
      'local-send-result',
    ]) {
      expect(output).toContain(`[${id}]`);
    }
  });

  it('allows matches covered by the baseline, an allow comment, a comment line or a test file', () => {
    const root = makeRoot(
      {
        'packages/ui/src/a.tsx': 'x.toFixed(2);\n',
        'packages/ui/src/b.tsx': '// domain-allow: local-format chart axis\nx.toFixed(1);\n',
        'packages/ui/src/c.tsx': ' * never use toISOString().slice(0, 10)\n',
        'packages/ui/src/d.test.tsx': 'x.toFixed(2);\n',
      },
      { 'local-format': { 'packages/ui/src/a.tsx': 1 } },
    );
    expect(run(root).code).toBe(0);
  });

  it('fails when the baseline is looser than the code, and --update-baseline tightens it', () => {
    const root = makeRoot(
      { 'packages/ui/src/a.tsx': 'x.toFixed(2);\n' },
      { 'local-format': { 'packages/ui/src/a.tsx': 2 } },
    );
    const loose = run(root);
    expect(loose.code).toBe(1);
    expect(loose.output).toContain('--update-baseline');

    expect(run(root, '--update-baseline').code).toBe(0);
    const baseline = JSON.parse(
      readFileSync(join(root, 'scripts', 'domain-patterns-baseline.json'), 'utf8'),
    );
    expect(baseline['local-format']).toEqual({ 'packages/ui/src/a.tsx': 1 });
    expect(run(root).code).toBe(0);
  });
});
