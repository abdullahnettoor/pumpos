#!/usr/bin/env node
/**
 * Renders every report proposal PDF to docs/report-proposals/pdf/<nn>-<slug>.pdf.
 *
 *   npm run report-proposals -w @pump/ui            # all
 *   npm run report-proposals -w @pump/ui -- 01 05   # only these numbers
 *
 * The templates are TSX under src/services/reports/proposals; Vite's module
 * runner loads them (the same transform the app and tests use), so no extra
 * TS runner is needed. Output is deterministic: fixed dates, seeded samples.
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, createServerModuleRunner } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const repo = path.resolve(pkg, '../..');
const outDir = path.join(repo, 'docs/report-proposals/pdf');
const fontsDir = path.join(repo, 'apps/desktop/public/fonts');

// `@pump/shared` from source, as the tests resolve it (vitest.aliases.config.ts).
// A long-lived runner: each proposal loads its template and sample on demand.
const server = await createServer({
  root: pkg,
  configFile: false,
  logLevel: 'warn',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@pump/shared': path.join(repo, 'packages/shared/src/index.ts') } },
  ssr: { noExternal: ['@pump/shared'] },
});
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
const load = (file) => runner.import(path.join(pkg, 'src/services/reports/proposals', file));
const registry = await load('registry.tsx');
const shared = await load('shared.tsx');
const { renderToBuffer } = await import('@react-pdf/renderer');

shared.registerProposalFonts(fontsDir);
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
// A first render loads the fonts; loads race, so objects from a cold render come out in varying order.
const warm = registry.PROPOSALS.find((e) => e.nn === '01');
await renderToBuffer(await warm.render());
const realRandom = Math.random;
const failed = [];
for (const entry of registry.PROPOSALS) {
  if (only.length && !only.includes(entry.nn)) continue;
  const file = path.join(outDir, `${entry.nn}-${entry.slug}.pdf`);
  // pdfkit names font subsets with Math.random(); a seeded one keeps re-renders byte-identical.
  let seed = 0x5eed + Number(entry.nn);
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let raw;
  try {
    raw = await renderToBuffer(await entry.render());
  } catch (err) {
    Math.random = realRandom;
    failed.push(entry.nn);
    console.error(`${entry.nn}-${entry.slug}: ${err?.message ?? err}`);
    continue;
  }
  Math.random = realRandom;
  // pdfkit derives the file ID from the wall clock; replace it with a hash of the content.
  const text = raw.toString('latin1');
  const idRe = /\/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\]/;
  const id = createHash('md5').update(text.replace(idRe, '')).digest('hex');
  const buf = Buffer.from(text.replace(idRe, `/ID [<${id}> <${id}>]`), 'latin1');
  fs.writeFileSync(file, buf);
  console.log(`${path.relative(repo, file)}  ${(buf.length / 1024).toFixed(0)} KB`);
}

await runner.close();
await server.close();

if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
