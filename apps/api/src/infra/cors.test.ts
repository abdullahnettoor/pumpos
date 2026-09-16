import { describe, it, expect } from 'vitest';
import { resolveCorsOrigin } from './cors.js';

const PROD = { ENVIRONMENT: 'production' };
const PREVIEW = { ENVIRONMENT: 'preview' };

describe('resolveCorsOrigin', () => {
  describe('fixed allow-list', () => {
    it.each([
      'https://console.pumpos.app',
      'https://m.pumpos.app',
      'https://console.pumpos.abdullahnettoor.com',
      'http://localhost:5173',
      'tauri://localhost',
    ])('allows %s on production', (origin) => {
      expect(resolveCorsOrigin(origin, PROD)).toBe(origin);
    });

    it('refuses an origin that is not on the list', () => {
      expect(resolveCorsOrigin('https://evil.example.com', PROD)).toBeNull();
    });

    it('applies no CORS decision when there is no Origin header', () => {
      // Non-browser clients are not subject to CORS at all.
      expect(resolveCorsOrigin(undefined, PROD)).toBeNull();
      expect(resolveCorsOrigin('', PROD)).toBeNull();
    });
  });

  describe('per-PR preview front ends', () => {
    const preview = 'https://pr-123-pumpos-console.acme.workers.dev';

    it('allows a preview console against the preview API', () => {
      // This is the bug being fixed: the preview front end is served from
      // workers.dev, so without this the browser blocks every API call and
      // reports it as an unhelpful network error.
      expect(resolveCorsOrigin(preview, PREVIEW)).toBe(preview);
    });

    it('allows a preview mobile app against the preview API', () => {
      const origin = 'https://pr-7-pumpos-mobile.acme.workers.dev';
      expect(resolveCorsOrigin(origin, PREVIEW)).toBe(origin);
    });

    it('refuses the same origin against production', () => {
      // The whole point of the gate: a workers.dev origin must never be able to
      // read production data.
      expect(resolveCorsOrigin(preview, PROD)).toBeNull();
    });

    it('refuses it when the environment is unset', () => {
      expect(resolveCorsOrigin(preview, {})).toBeNull();
      expect(resolveCorsOrigin(preview, undefined)).toBeNull();
    });
  });

  describe('the preview pattern cannot be widened', () => {
    // Anyone can register a workers.dev subdomain, so each of these is an
    // origin an attacker could actually obtain.
    it.each([
      ['an unrelated workers.dev app', 'https://evil.acme.workers.dev'],
      ['a lookalike prefix', 'https://notpr-1-pumpos-console.acme.workers.dev'],
      ['a non-numeric PR segment', 'https://pr-abc-pumpos-console.acme.workers.dev'],
      ['an app name not on the list', 'https://pr-1-pumpos-admin.acme.workers.dev'],
      ['a suffix past the TLD', 'https://pr-1-pumpos-console.acme.workers.dev.evil.com'],
      ['a prefix before the scheme', 'https://evil.com/https://pr-1-pumpos-console.a.workers.dev'],
      ['plain http', 'http://pr-1-pumpos-console.acme.workers.dev'],
      ['a deeper subdomain', 'https://pr-1-pumpos-console.a.b.workers.dev'],
      ['an embedded newline', 'https://pr-1-pumpos-console.acme.workers.dev\nevil'],
    ])('refuses %s even on preview', (_label, origin) => {
      expect(resolveCorsOrigin(origin, PREVIEW)).toBeNull();
    });
  });
});
