import { z } from 'zod';

/**
 * Zod 3's English messages, kept under Zod 4 (#722).
 *
 * Zod 4 rewrote its default messages ("Required" became "Invalid input:
 * expected string, received undefined"). They reach operators through API
 * VALIDATION_ERROR messages and through form fields without a message of their
 * own, so the old wording is restored globally. Messages given in a schema
 * still win; issue kinds Zod 3 never had fall through to Zod 4's default.
 */

type Issue = Parameters<z.core.$ZodErrorMap>[0];

/** Zod 3's name for a value's type ("nan", "null", "array", …). */
function receivedType(input: unknown): string {
  switch (typeof input) {
    case 'number':
      return Number.isNaN(input) ? 'nan' : 'number';
    case 'object':
      if (input === null) return 'null';
      if (Array.isArray(input)) return 'array';
      if (input instanceof Map) return 'map';
      if (input instanceof Set) return 'set';
      if (input instanceof Date) return 'date';
      if (typeof (input as { then?: unknown }).then === 'function') return 'promise';
      return 'object';
    default:
      return typeof input;
  }
}

const quoted = (values: readonly unknown[]): string =>
  values.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ');

function invalidType(issue: Extract<Issue, { code: 'invalid_type' }>): string {
  const { input, expected } = issue;
  if (input === undefined) return 'Required';
  if (typeof input === 'number' && !Number.isNaN(input) && !Number.isFinite(input)) {
    return 'Number must be finite';
  }
  if (expected === 'int' && typeof input === 'number' && !Number.isNaN(input)) {
    return 'Expected integer, received float';
  }
  return `Expected ${expected === 'int' ? 'integer' : expected}, received ${receivedType(input)}`;
}

type SizeIssue = Extract<Issue, { code: 'too_small' }> | Extract<Issue, { code: 'too_big' }>;

function size(issue: SizeIssue): string | undefined {
  const small = issue.code === 'too_small';
  const limit = issue.code === 'too_small' ? issue.minimum : issue.maximum;
  const exact = issue.exact === true;
  const inclusive = issue.inclusive !== false;
  switch (issue.origin) {
    case 'string':
    case 'array': {
      const word = exact
        ? 'exactly'
        : small
          ? inclusive
            ? 'at least'
            : 'over'
          : inclusive
            ? 'at most'
            : 'under';
      const noun = issue.origin === 'string' ? 'String' : 'Array';
      const unit = issue.origin === 'string' ? 'character(s)' : 'element(s)';
      return `${noun} must contain ${word} ${String(limit)} ${unit}`;
    }
    case 'number':
    case 'int':
    case 'bigint': {
      const noun = issue.origin === 'bigint' ? 'BigInt' : 'Number';
      const word = exact
        ? 'exactly equal to'
        : small
          ? inclusive
            ? 'greater than or equal to'
            : 'greater than'
          : inclusive
            ? 'less than or equal to'
            : 'less than';
      return `${noun} must be ${word} ${String(limit)}`;
    }
    case 'date': {
      const word = exact
        ? 'exactly equal to'
        : small
          ? inclusive
            ? 'greater than or equal to'
            : 'greater than'
          : inclusive
            ? 'smaller than or equal to'
            : 'smaller than';
      return `Date must be ${word} ${new Date(Number(limit)).toString()}`;
    }
    default:
      return 'Invalid input';
  }
}

function invalidFormat(issue: Extract<Issue, { code: 'invalid_format' }>): string {
  switch (issue.format) {
    case 'regex':
      return 'Invalid';
    // Shape-only ids (`.guid()`) are Zod 3's `.uuid()`.
    case 'guid':
      return 'Invalid uuid';
    case 'starts_with':
      return `Invalid input: must start with "${(issue as { prefix?: string }).prefix ?? ''}"`;
    case 'ends_with':
      return `Invalid input: must end with "${(issue as { suffix?: string }).suffix ?? ''}"`;
    case 'includes':
      return `Invalid input: must include "${(issue as { includes?: string }).includes ?? ''}"`;
    case 'ipv4':
    case 'ipv6':
      return 'Invalid ip';
    default:
      return `Invalid ${issue.format}`;
  }
}

/**
 * A literal (one value) or an enum (several). Zod 3 checked an enum's type
 * first: missing read "Required", a non-string named the type it got.
 */
function invalidValue(issue: Extract<Issue, { code: 'invalid_value' }>): string {
  const { values, input } = issue;
  if (values.length === 1) return `Invalid literal value, expected ${JSON.stringify(values[0])}`;
  if (input === undefined) return 'Required';
  if (typeof input !== 'string')
    return `Expected ${quoted(values)}, received ${receivedType(input)}`;
  return `Invalid enum value. Expected ${quoted(values)}, received '${input}'`;
}

export const zod3Messages: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return invalidType(issue);
    case 'too_small':
    case 'too_big':
      return size(issue);
    case 'invalid_format':
      return invalidFormat(issue);
    case 'not_multiple_of':
      return `Number must be a multiple of ${String(issue.divisor)}`;
    case 'invalid_value':
      return invalidValue(issue);
    case 'unrecognized_keys':
      return `Unrecognized key(s) in object: ${issue.keys.map((k) => `'${k}'`).join(', ')}`;
    case 'invalid_union':
    case 'custom':
      return 'Invalid input';
    default:
      return undefined;
  }
};

/** Use Zod 3's wording for every schema in this process. */
export function installZod3Messages(): void {
  z.config({ customError: zod3Messages });
}

/**
 * Zod 3's `invalid_type_error`: `message` when the value is the wrong type,
 * while a missing value still reads "Required" and checks keep their own
 * messages.
 */
export const invalidTypeError = (message: string) => ({
  error: (issue: Issue) =>
    issue.code === 'invalid_type' && issue.input !== undefined ? message : undefined,
});
