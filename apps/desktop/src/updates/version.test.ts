import { describe, expect, it } from 'vitest';
import { isNewerVersion, normalizeUpdateError, sanitizeReleaseNotes } from './version.js';

describe('isNewerVersion', () => {
  it.each([
    ['1.1.0', '1.0.0', true],
    ['1.0.1', '1.0.0', true],
    ['2.0.0', '1.9.9', true],
    ['1.0.0', '1.0.0', false],
    ['1.0.0', '1.0.1', false],
    // Phase one has no downgrade path, so an older manifest is simply ignored.
    ['0.9.0', '1.0.0', false],
    // A prerelease sorts below its release (SemVer §11).
    ['1.1.0-rc.1', '1.1.0', false],
    ['1.1.0', '1.1.0-rc.1', true],
  ])('%s over %s -> %s', (offered, installed, expected) => {
    expect(isNewerVersion(offered, installed)).toBe(expected);
  });

  it.each([
    // The exact shape scripts/preview-desktop.mjs produces. A preview build
    // must never be able to offer itself to a client as newer than the release
    // it was built from — nor than an older one, which would be a downgrade
    // wearing a prerelease label.
    ['1.3.2-preview.a1b2c3d', '1.3.2'],
    ['1.3.2-preview.a1b2c3d', '1.3.3'],
    ['1.3.2-preview.a1b2c3d', '1.3.2-preview.b2c3d4e'],
  ])('a preview build (%s) never looks newer than %s', (preview, installed) => {
    expect(isNewerVersion(preview, installed)).toBe(false);
  });

  it('refuses to compare unreadable versions', () => {
    expect(isNewerVersion('latest', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', 'unknown')).toBe(false);
  });
});

describe('normalizeUpdateError', () => {
  it('separates a Tauri signature rejection from ordinary network trouble', () => {
    const signature = normalizeUpdateError(new Error('Signature verification failed'));
    expect(signature.kind).toBe('signature');
    // Support must be able to tell this apart from Gatekeeper/SmartScreen.
    expect(signature.message).toMatch(/official PumpOS release/);
  });

  it.each([
    [new Error('getaddrinfo ENOTFOUND github.com'), 'offline'],
    [new Error('Request timed out'), 'timeout'],
    [new Error('http status code 503'), 'network'],
    ['something unusual', 'unknown'],
  ])('classifies %s', (cause, kind) => {
    expect(normalizeUpdateError(cause).kind).toBe(kind);
  });
});

describe('sanitizeReleaseNotes', () => {
  it('keeps plain text and line breaks, drops control characters', () => {
    expect(sanitizeReleaseNotes('  Line one\r\nLine\u0007 two  ')).toBe('Line one\nLine two');
  });

  it('never interprets markup — the caller renders text nodes', () => {
    expect(sanitizeReleaseNotes('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });

  it('truncates absurdly long notes', () => {
    expect(sanitizeReleaseNotes('a'.repeat(5000)).length).toBe(4001);
  });

  it('handles missing notes', () => {
    expect(sanitizeReleaseNotes(null)).toBe('');
    expect(sanitizeReleaseNotes(undefined)).toBe('');
  });
});
