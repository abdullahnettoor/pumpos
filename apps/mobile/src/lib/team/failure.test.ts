import { describe, expect, it } from 'vitest';
import { isEarlierAttemptReceived, isOutcomeUnknown, teamFailure } from './failure.js';

const failure = (code: string | undefined, message: string, status: number | undefined) =>
  Object.assign(new Error(message), { code, status });

describe('teamFailure', () => {
  it('passes the server wording for a Restricted Access / Suspended refusal', () => {
    for (const code of ['SUBSCRIPTION_RESTRICTED', 'ORGANIZATION_SUSPENDED']) {
      const f = teamFailure(failure(code, 'Team administration is blocked.', 403), 'add');
      expect(f.message).toBe('Team administration is blocked.');
      expect(f.unknownOutcome).toBe(false);
    }
  });
  it('explains a reached Limit with the server wording, or a fallback', () => {
    expect(
      teamFailure(failure('LIMIT_REACHED', 'This plan includes 5 seats.', 409), 'add').message,
    ).toBe('This plan includes 5 seats.');
    const bare = teamFailure(failure('LIMIT_REACHED', '', 409), 'add');
    expect(bare.message).toMatch(/Contact PumpOS/);
    expect(bare.unknownOutcome).toBe(false);
  });
  it('shows the server reason for a forbidden change', () => {
    expect(
      teamFailure(failure('FORBIDDEN', 'Not allowed to edit this user', 403), 'update').message,
    ).toBe('Not allowed to edit this user');
    expect(teamFailure(failure('FORBIDDEN', '', 403), 'reset').message).toMatch(/permission/);
  });
  it('says a vanished member is gone', () => {
    expect(teamFailure(failure('NOT_FOUND', 'User not found', 404), 'status').message).toMatch(
      /no longer on the team/,
    );
  });
  it('has a fallback for anything else', () => {
    expect(teamFailure('boom', 'add').message).toMatch(/Could not add this member/);
  });
});

describe('what the key does after a failure', () => {
  it('keeps the outcome open for a network drop and a 5xx', () => {
    expect(isOutcomeUnknown(failure(undefined, 'offline', undefined))).toBe(true);
    expect(isOutcomeUnknown(failure('INTERNAL', 'x', 503))).toBe(true);
    expect(teamFailure(failure(undefined, 'offline', undefined), 'add').unknownOutcome).toBe(true);
  });
  it('treats an attempt still in flight as unknown', () => {
    expect(
      isOutcomeUnknown(
        failure('CONFLICT', 'A request with this Idempotency-Key is already in progress', 409),
      ),
    ).toBe(true);
  });
  it('treats a refusal as decided', () => {
    expect(isOutcomeUnknown(failure('FORBIDDEN', 'no', 403))).toBe(false);
    expect(isOutcomeUnknown(failure('AUTH_PROVISION_FAILED', 'exists', 409))).toBe(false);
  });
  it('recognises an earlier attempt held under the key with other content', () => {
    const e = failure(
      'CONFLICT',
      'This Idempotency-Key was already used with different request content',
      409,
    );
    expect(isEarlierAttemptReceived(e)).toBe(true);
    const f = teamFailure(e, 'add');
    expect(f.earlierAttemptReceived).toBe(true);
    expect(f.unknownOutcome).toBe(false);
    expect(f.message).toMatch(/earlier attempt/i);
  });
});
