import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { sendResult, STATUS_BY_CODE } from './send-result.js';

/**
 * The status map is the whole reason this module exists: it used to be copied
 * into every router, and a code missing from one copy silently degraded to
 * 400 — which is how LIMIT_REACHED shipped as a 400 from the one route that
 * raises it. These tests pin the contract at the boundary.
 */

const errorResult = (code: string) => ({
  success: false as const,
  error: { code, message: 'refused', details: { limit: 'station_count' } },
});

async function statusFor(code: string): Promise<number> {
  const app = new Hono();
  app.get('/', (c) => sendResult(c, errorResult(code)));
  return (await app.request('/')).status;
}

describe('sendResult', () => {
  it('returns the success envelope', async () => {
    const app = new Hono();
    app.get('/', (c) => sendResult(c, { success: true, data: { id: 'x' } }));

    const res = await app.request('/');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { id: 'x' } });
  });

  it.each([
    ['VALIDATION_ERROR', 400],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['FORBIDDEN', 403],
    ['UNAUTHORIZED', 401],
    ['INVARIANT_VIOLATION', 409],
    ['LIMIT_REACHED', 409],
    ['CAPABILITY_NOT_ENTITLED', 403],
  ])('maps %s to HTTP %i', async (code, status) => {
    expect(await statusFor(code)).toBe(status);
  });

  it('preserves the structured details a client needs to explain the refusal', async () => {
    const app = new Hono();
    app.get('/', (c) => sendResult(c, errorResult('LIMIT_REACHED')));

    const body = (await (await app.request('/')).json()) as any;

    expect(body).toEqual({
      success: false,
      error: { code: 'LIMIT_REACHED', message: 'refused', details: { limit: 'station_count' } },
    });
  });

  it('falls back to 400 for an unrecognized code', async () => {
    expect(await statusFor('SOMETHING_NEW')).toBe(400);
  });

  it('covers every access-policy code the client reacts to', async () => {
    // isAccessPolicyError in @pump/shared triggers Access Document refetch on
    // exactly these; a missing status mapping would hide them behind a 400.
    expect(STATUS_BY_CODE.LIMIT_REACHED).toBe(409);
    expect(STATUS_BY_CODE.CAPABILITY_NOT_ENTITLED).toBe(403);
  });
});
