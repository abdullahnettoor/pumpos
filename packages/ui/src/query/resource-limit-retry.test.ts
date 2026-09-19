import { describe, expect, it } from 'vitest';
import { createQueryClient, shouldRetryQuery } from './queryClient.js';
import { classifyNonJsonFailure, isResourceLimitError, RESOURCE_LIMIT } from '../services/cloud.js';

/**
 * #148 / #113: Cloudflare resource-limit terminations (error 1102, HTML body,
 * 5xx) must surface as a distinct RESOURCE_LIMIT error and must NOT be
 * retried by the query client — one over-budget request must not amplify
 * load. Genuinely transient failures keep their single retry.
 */

function resourceLimitError(): Error & { code?: string } {
  const err = new Error('compute limit') as Error & { code?: string };
  err.code = RESOURCE_LIMIT;
  return err;
}

describe('classifyNonJsonFailure', () => {
  it('maps a Cloudflare 1102 error page to RESOURCE_LIMIT', () => {
    const html = '<html><body>Worker exceeded resource limits · Error 1102</body></html>';
    expect(classifyNonJsonFailure(503, false, html).code).toBe(RESOURCE_LIMIT);
    expect(classifyNonJsonFailure(500, false, 'error code: 1102').code).toBe(RESOURCE_LIMIT);
  });

  it('keeps other non-JSON failures as BAD_RESPONSE', () => {
    expect(classifyNonJsonFailure(502, false, '<html>Bad gateway</html>').code).toBe(
      'BAD_RESPONSE',
    );
    expect(classifyNonJsonFailure(404, false, 'not found 1102-adjacent? no: status<500').code).toBe(
      'BAD_RESPONSE',
    );
    expect(classifyNonJsonFailure(200, true, '').code).toBe('BAD_RESPONSE');
  });

  it('gives the operator an accurate message, not a connectivity one', () => {
    const { message } = classifyNonJsonFailure(503, false, 'error 1102');
    expect(message).toMatch(/compute limit/i);
    expect(message).toMatch(/not a connectivity problem/i);
  });
});

describe('shouldRetryQuery', () => {
  it('never retries a resource-limit error', () => {
    expect(shouldRetryQuery(0, resourceLimitError())).toBe(false);
  });

  it('retries a transient failure exactly once', () => {
    const transient = new Error('Network error');
    expect(shouldRetryQuery(0, transient)).toBe(true);
    expect(shouldRetryQuery(1, transient)).toBe(false);
  });
});

describe('query client integration', () => {
  it('fetches only once when the API reports a resource limit', async () => {
    const qc = createQueryClient();
    let calls = 0;
    await expect(
      qc.fetchQuery({
        queryKey: ['resource-limit-probe'],
        queryFn: async () => {
          calls += 1;
          throw resourceLimitError();
        },
        retryDelay: 0,
      }),
    ).rejects.toMatchObject({ code: RESOURCE_LIMIT });
    expect(calls).toBe(1);
    qc.clear();
  });

  it('retries a transient failure once (two fetches)', async () => {
    const qc = createQueryClient();
    let calls = 0;
    await expect(
      qc.fetchQuery({
        queryKey: ['transient-probe'],
        queryFn: async () => {
          calls += 1;
          throw new Error('Network error');
        },
        retryDelay: 0,
      }),
    ).rejects.toThrow('Network error');
    expect(calls).toBe(2);
    qc.clear();
  });
});

describe('isResourceLimitError', () => {
  it('matches only the RESOURCE_LIMIT code', () => {
    expect(isResourceLimitError(resourceLimitError())).toBe(true);
    expect(isResourceLimitError(new Error('x'))).toBe(false);
    expect(isResourceLimitError(null)).toBe(false);
  });
});
