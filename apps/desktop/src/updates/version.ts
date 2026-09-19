import type { UpdateError } from './types.js';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

export function parseVersion(raw: string | null | undefined): ParsedVersion | null {
  const match = SEMVER.exec((raw ?? '').trim().replace(/^v/, ''));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/** -1, 0 or 1. A prerelease sorts below the same release (SemVer §11). */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

/**
 * Phase one ships one stable channel and no downgrades, so an offer is only an
 * offer when it is strictly newer than what is installed. A manifest that
 * points at an older or identical version reads as "up to date", never as a
 * reason to reinstall.
 */
export function isNewerVersion(offered: string, installed: string): boolean {
  const next = parseVersion(offered);
  const current = parseVersion(installed);
  if (!next || !current) return false;
  return compareVersions(next, current) > 0;
}

/**
 * Collapse whatever the updater plugin threw into one of a handful of causes
 * the operator and support can act on. The raw text is kept in `message`
 * because that is what support asks for; the `kind` is what the UI branches on.
 */
export function normalizeUpdateError(cause: unknown): UpdateError {
  const message = errorMessage(cause);
  const lower = message.toLowerCase();

  if (/signature|verif|pubkey|public key|untrusted/.test(lower)) {
    return {
      kind: 'signature',
      message: 'This update could not be verified as an official PumpOS release and was rejected.',
    };
  }
  if (/timed? ?out|timeout|deadline/.test(lower)) {
    return { kind: 'timeout', message: 'The update server did not respond in time.' };
  }
  if (/offline|dns|enotfound|econnrefused|unreachable|failed to fetch|network/.test(lower)) {
    return {
      kind: 'offline',
      message: 'PumpOS could not reach the update server. Check the connection and try again.',
    };
  }
  if (/\b(4\d\d|5\d\d)\b|http|status code/.test(lower)) {
    return { kind: 'network', message: `The update server returned an error: ${message}` };
  }
  return { kind: 'unknown', message };
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

/**
 * Release notes are treated as untrusted plain text: newlines are preserved,
 * everything else is flattened. The UI renders the result as text nodes, so a
 * manifest can never inject markup into the shell.
 */
export function sanitizeReleaseNotes(raw: string | null | undefined, maxLength = 4000): string {
  if (typeof raw !== 'string') return '';
  const text = raw
    .replace(/\r\n?/g, '\n')
    // Strip control characters other than newline and tab.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
