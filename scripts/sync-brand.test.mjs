import { describe, expect, it } from 'vitest';
import { BRAND_FILES, TARGET_DIRS, planBrandSync, syncBrandAssets } from './sync-brand.mjs';

/** In-memory stand-in for the fs calls the sync makes, so tests touch no disk. */
function fakeFs(initial = {}) {
  const files = new Map(Object.entries(initial).map(([p, v]) => [p, Buffer.from(v)]));
  const dirs = [];
  const writes = [];
  return {
    files,
    dirs,
    writes,
    async mkdir(path) {
      dirs.push(path);
    },
    async readFile(path) {
      const found = files.get(path);
      if (!found) {
        const err = new Error(`ENOENT: ${path}`);
        err.code = 'ENOENT';
        throw err;
      }
      return found;
    },
    async writeFile(path, bytes) {
      writes.push(path);
      files.set(path, Buffer.from(bytes));
    },
  };
}

describe('brand asset fan-out plan', () => {
  it('sends every canonical file to every app', () => {
    const plan = planBrandSync({ files: ['a.svg', 'b.svg'], targets: ['one/brand', 'two/brand'] });

    expect(plan).toEqual([
      { file: 'a.svg', source: 'brand/a.svg', destination: 'one/brand/a.svg' },
      { file: 'a.svg', source: 'brand/a.svg', destination: 'two/brand/a.svg' },
      { file: 'b.svg', source: 'brand/b.svg', destination: 'one/brand/b.svg' },
      { file: 'b.svg', source: 'brand/b.svg', destination: 'two/brand/b.svg' },
    ]);
  });

  it('reaches the marketing site, which cannot import from the shared package', () => {
    expect(TARGET_DIRS).toContain('apps/marketing/public/brand');
  });

  it('reaches every app that renders the brand', () => {
    expect(TARGET_DIRS).toEqual([
      'apps/console/public/brand',
      'apps/desktop/public/brand',
      'apps/mobile/public/brand',
      'apps/marketing/public/brand',
    ]);
  });

  it('carries the canonical mark', () => {
    expect(BRAND_FILES).toContain('pumpos-mark.svg');
  });
});

describe('brand asset fan-out', () => {
  const plan = [
    { file: 'm.svg', source: 'brand/m.svg', destination: 'one/brand/m.svg' },
    { file: 'm.svg', source: 'brand/m.svg', destination: 'two/brand/m.svg' },
  ];

  it('copies the canonical bytes into every destination', async () => {
    const fs = fakeFs({ '/r/brand/m.svg': '<svg/>' });

    const result = await syncBrandAssets({ root: '/r', plan, fs });

    expect(fs.files.get('/r/one/brand/m.svg').toString()).toBe('<svg/>');
    expect(fs.files.get('/r/two/brand/m.svg').toString()).toBe('<svg/>');
    expect(result.written).toEqual(['one/brand/m.svg', 'two/brand/m.svg']);
    expect(result.unchanged).toEqual([]);
  });

  it('writes nothing on a second run', async () => {
    const fs = fakeFs({ '/r/brand/m.svg': '<svg/>' });

    await syncBrandAssets({ root: '/r', plan, fs });
    fs.writes.length = 0;
    const second = await syncBrandAssets({ root: '/r', plan, fs });

    expect(fs.writes).toEqual([]);
    expect(second.written).toEqual([]);
    expect(second.unchanged).toEqual(['one/brand/m.svg', 'two/brand/m.svg']);
  });

  it('overwrites a destination that has drifted from the canonical file', async () => {
    const fs = fakeFs({
      '/r/brand/m.svg': '<svg>new</svg>',
      '/r/one/brand/m.svg': '<svg>old</svg>',
    });

    const result = await syncBrandAssets({ root: '/r', plan, fs });

    expect(fs.files.get('/r/one/brand/m.svg').toString()).toBe('<svg>new</svg>');
    expect(result.written).toContain('one/brand/m.svg');
  });

  it('creates destination directories that do not exist yet', async () => {
    const fs = fakeFs({ '/r/brand/m.svg': '<svg/>' });

    await syncBrandAssets({ root: '/r', plan, fs });

    expect(fs.dirs).toContain('/r/one/brand');
    expect(fs.dirs).toContain('/r/two/brand');
  });

  it('reads each canonical file once however many apps consume it', async () => {
    const reads = [];
    const fs = fakeFs({ '/r/brand/m.svg': '<svg/>' });
    const counted = {
      ...fs,
      async readFile(path) {
        reads.push(path);
        return fs.readFile(path);
      },
    };

    await syncBrandAssets({ root: '/r', plan, fs: counted });

    expect(reads.filter((p) => p === '/r/brand/m.svg')).toHaveLength(1);
  });

  it('fails loudly when the canonical file is missing, rather than copying nothing', async () => {
    const fs = fakeFs({});

    await expect(syncBrandAssets({ root: '/r', plan, fs })).rejects.toThrow('brand/m.svg');
  });
});
