import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldEnableUpdates, detectTauri, STABLE_UPDATE_ENDPOINT } from './environment.js';

describe('shouldEnableUpdates', () => {
  it('enables the stable channel only for a packaged production build', () => {
    expect(
      shouldEnableUpdates({ isTauri: true, buildEnvironment: 'production', isDevServer: false }),
    ).toBe(true);
  });

  it('never checks from the browser (web console, mobile, preview server)', () => {
    expect(shouldEnableUpdates({ isTauri: false, buildEnvironment: 'production' })).toBe(false);
  });

  it.each(['local', 'dev', 'preview'] as const)('never checks from a %s build', (env) => {
    expect(shouldEnableUpdates({ isTauri: true, buildEnvironment: env })).toBe(false);
  });

  it('never checks while the dev server is driving the app', () => {
    expect(
      shouldEnableUpdates({ isTauri: true, buildEnvironment: 'production', isDevServer: true }),
    ).toBe(false);
  });

  it('allows a deliberate override inside the desktop shell only', () => {
    expect(
      shouldEnableUpdates({ isTauri: true, buildEnvironment: 'local', forceEnabled: true }),
    ).toBe(true);
    expect(
      shouldEnableUpdates({ isTauri: false, buildEnvironment: 'local', forceEnabled: true }),
    ).toBe(false);
  });
});

describe('detectTauri', () => {
  it('recognises the packaged shell by its injected internals', () => {
    expect(detectTauri({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(detectTauri({})).toBe(false);
    expect(detectTauri(undefined)).toBe(false);
  });
});

describe('STABLE_UPDATE_ENDPOINT', () => {
  it('is the public HTTPS latest-release manifest', () => {
    expect(STABLE_UPDATE_ENDPOINT).toBe(
      'https://github.com/abdullahnettoor/pumpos/releases/latest/download/latest.json',
    );
  });

  it('is exactly what the packaged app is configured to poll', () => {
    // The updater plugin reads the endpoint from tauri.conf.json, so this
    // constant is documentation — and documentation that can drift from the
    // thing it describes is worse than none. Pin them together.
    const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
      plugins: { updater: { endpoints: string[] } };
    };
    expect(config.plugins.updater.endpoints).toEqual([STABLE_UPDATE_ENDPOINT]);
  });
});
