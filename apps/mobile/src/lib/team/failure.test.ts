import { describe, expect, it } from 'vite-plus/test';
import { IDEMPOTENCY_IN_PROGRESS } from '@pump/shared';
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

describe('giving app access', () => {
  const conflict = (reason: string, message: string) =>
    Object.assign(new Error(message), { code: 'CONFLICT', status: 409, details: { reason } });

  it('says the member already has a login, and that the list is out of date', () => {
    const f = teamFailure(conflict('ALREADY_HAS_LOGIN', 'User already has a login'), 'access');
    expect(f.message).toMatch(/already has a login/i);
    expect(f.unknownOutcome).toBe(false);
    expect(f.listOutdated).toBe(true);
  });
  it('says the email or phone is taken', () => {
    const f = teamFailure(conflict('IDENTITY_TAKEN', 'That phone is taken'), 'access');
    expect(f.message).toMatch(/already .*another login/i);
    expect(f.unknownOutcome).toBe(false);
    expect(f.listOutdated).toBe(false);
  });
  it('explains a reached login Limit with the server wording, or a fallback about logins', () => {
    expect(
      teamFailure(failure('LIMIT_REACHED', 'This plan includes 5 logins.', 409), 'access').message,
    ).toBe('This plan includes 5 logins.');
    expect(teamFailure(failure('LIMIT_REACHED', '', 409), 'access').message).toMatch(
      /another login.*Contact PumpOS/,
    );
  });
  it('leaves an attempt still in flight as an unknown outcome, not a taken identity', () => {
    const f = teamFailure(
      failure('CONFLICT', 'A request with this Idempotency-Key is already in progress', 409),
      'access',
    );
    expect(f.unknownOutcome).toBe(true);
  });
  it('has its own fallback wording', () => {
    expect(teamFailure('boom', 'access').message).toMatch(/Could not give app access/);
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
    // The reason the API sends; the message above is the legacy form (one release).
    expect(
      isOutcomeUnknown(
        Object.assign(failure('CONFLICT', 'Busy', 409), {
          details: { reason: IDEMPOTENCY_IN_PROGRESS },
        }),
      ),
    ).toBe(true);
    expect(
      isOutcomeUnknown(failure('CONFLICT', 'This Idempotency-Key belongs to another user', 409)),
    ).toBe(false);
  });
  it('treats a refusal as decided', () => {
    expect(isOutcomeUnknown(failure('FORBIDDEN', 'no', 403))).toBe(false);
    expect(isOutcomeUnknown(failure('AUTH_PROVISION_FAILED', 'exists', 409))).toBe(false);
  });
  it('recognises an earlier attempt held under the key with other content', () => {
    const e = failure(
      'IDEMPOTENCY_KEY_REUSED',
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
