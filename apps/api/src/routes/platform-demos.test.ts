import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { platformDemosRouter } from './platform-demos.js';

function app() {
  const root = new Hono();
  root.use('*', async (c, next) => {
    c.set(
      'db' as never,
      {
        transaction: async (run: (tx: unknown) => Promise<unknown>) =>
          run({
            select: () => ({
              from: () => ({
                where: () => ({
                  for: () => ({ limit: async () => [{ id: 'org-1', isDemo: false }] }),
                }),
              }),
            }),
          }),
        select: () => ({
          from: () => ({
            where: () =>
              Object.assign(Promise.resolve([]), {
                limit: async () => [{ id: 'org-1', isDemo: false }],
              }),
          }),
        }),
      } as never,
    );
    c.set('platformAdmin' as never, { email: 'admin@pumpos.app', subjectId: 'admin-1' } as never);
    await next();
  });
  root.route('/demos', platformDemosRouter);
  return root;
}

describe('platform demo deployment guard', () => {
  it('refuses create, reset, extend and delete unless ALLOW_DEMO_ORGS is exactly true', async () => {
    const requests: Array<[string, string, unknown?]> = [
      ['POST', '/demos'],
      ['POST', '/demos/11111111-1111-4111-8111-111111111111/reset'],
      ['POST', '/demos/11111111-1111-4111-8111-111111111111/extend', { expiresInDays: 7 }],
      ['DELETE', '/demos/11111111-1111-4111-8111-111111111111'],
    ];
    for (const [method, path, body] of requests) {
      const response = await app().request(
        path,
        {
          method,
          ...(body
            ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
            : {}),
        },
        { ALLOW_DEMO_ORGS: 'false' },
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
    }
  });

  it('does not hard-delete an organization unless the row is marked as a demo', async () => {
    const response = await app().request(
      '/demos/org-1',
      { method: 'DELETE' },
      { ALLOW_DEMO_ORGS: 'true' },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'NOT_A_DEMO_ORGANIZATION' },
    });
  });

  it('rejects expiry windows outside 2, 7 and 30 days before touching organization data', async () => {
    const response = await app().request(
      '/demos/org-1/extend',
      {
        method: 'POST',
        body: JSON.stringify({ expiresInDays: 5 }),
        headers: { 'Content-Type': 'application/json' },
      },
      { ALLOW_DEMO_ORGS: 'true' },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});
