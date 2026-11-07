import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = path.join(dir, name);
    return statSync(abs).isDirectory() ? walk(abs) : [abs];
  });
}

export const isTest = (f: string) => /\.test\.tsx?$/.test(f);

/** Every non-test `.ts`/`.tsx` (`source`) and `.css` file under `root`, with its text. */
export function sourceFiles(
  root: string,
): Array<{ rel: string; kind: 'source' | 'css'; text: () => string }> {
  const out: Array<{ rel: string; kind: 'source' | 'css'; text: () => string }> = [];
  for (const abs of walk(root)) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const kind =
      /\.tsx?$/.test(rel) && !isTest(rel) ? 'source' : rel.endsWith('.css') ? 'css' : null;
    if (kind) out.push({ rel, kind, text: () => readFileSync(abs, 'utf8') });
  }
  return out;
}
