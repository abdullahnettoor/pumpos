import { describe, expect, it } from 'vitest';
import { environmentTagFor, resolveBuildEnvironment, showsDeveloperSurfaces } from './buildEnv.js';

describe('resolveBuildEnvironment', () => {
  it('reads the environment baked in at build time', () => {
    expect(resolveBuildEnvironment('production', false)).toBe('production');
    expect(resolveBuildEnvironment('preview', false)).toBe('preview');
    expect(resolveBuildEnvironment('dev', false)).toBe('dev');
    expect(resolveBuildEnvironment('local', false)).toBe('local');
  });

  it('is tolerant of case and surrounding whitespace', () => {
    expect(resolveBuildEnvironment('  Preview \n', false)).toBe('preview');
    expect(resolveBuildEnvironment('PROD', false)).toBe('production');
    expect(resolveBuildEnvironment('Development', false)).toBe('local');
  });

  it('treats the Vite dev server as local development', () => {
    expect(resolveBuildEnvironment(undefined, true)).toBe('local');
  });

  it('falls back to production for a packaged build, never to local', () => {
    // #116: a packaged Tauri app is always served from `localhost`. Guessing
    // "local" here is what put a yellow LOCAL badge on a production install.
    expect(resolveBuildEnvironment(undefined, false)).toBe('production');
    expect(resolveBuildEnvironment('', false)).toBe('production');
    expect(resolveBuildEnvironment('staging', false)).toBe('production');
  });
});

describe('environmentTagFor', () => {
  it('leaves production unbadged', () => {
    expect(environmentTagFor('production')).toBeNull();
  });

  it('badges every non-production environment', () => {
    expect(environmentTagFor('dev')).toBe('Dev');
    expect(environmentTagFor('preview')).toBe('Preview');
    expect(environmentTagFor('local')).toBe('Local');
  });
});

describe('showsDeveloperSurfaces', () => {
  it('exposes the Design System only during local development', () => {
    expect(showsDeveloperSurfaces('local')).toBe(true);
    expect(showsDeveloperSurfaces('dev')).toBe(false);
    expect(showsDeveloperSurfaces('preview')).toBe(false);
    expect(showsDeveloperSurfaces('production')).toBe(false);
  });
});
