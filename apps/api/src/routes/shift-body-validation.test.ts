import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { shiftsRouter } from './shifts.js';

/**
 * Malformed request bodies in the Shift family (#205).
 *
 * `POST /shifts/close` used to read `shiftId` straight out of the body and
 * hand it to a query. A missing id reached the driver as `undefined`, which
 * threw below the route — so the caller got a bare `500 Internal Server Error`
 * with a plain-text body instead of the `{ success, error }` envelope every
 * client parses.
 *
 * Two things were wrong with that. The status lied: a malformed request is the
 * caller's problem, not a server fault, and 500s page whoever is on call.
 * And the body was unparseable, so a client handling the failure hit a
 * `SyntaxError` on top of the original error. On shift close — the operation
 * that settles the drawer — an operator seeing an opaque 500 cannot tell
 * whether their close applied.
 */

/**
 * A DB that answers the access guard's four reads with a healthy Organization
 * and then fails loudly. Access policy is checked before body shape, so the
 * guard has to get its answer; everything after it is the handler, and nothing
 * malformed should ever get that far.
 */
function guardThenExplode() {
  const accessReads = [
    [
      {
        subscriptionPlan: 'CORE',
        subscriptionStatus: 'ACTIVE',
        accessUntil: null,
        suspendedAt: null,
      },
    ],
    [{ value: 1 }],
    [],
    [],
  ];
  const reached = () => {
    throw new Error('the request reached the database; validation should have stopped it');
  };
  const chainable = (rows: unknown[]): any => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (resolve: (v: unknown[]) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  };
  return {
    select: () => (accessReads.length > 0 ? chainable(accessReads.shift()!) : reached()),
    insert: reached,
    update: reached,
    transaction: reached,
    execute: reached,
  };
}

function app() {
  const instance = new Hono<{ Variables: { db: any; user: any } }>();
  instance.use('*', async (c, next) => {
    c.set('db', guardThenExplode());
    c.set('user', {
      id: 'user-1',
      email: 'owner@example.com',
      fullName: 'Owner',
      organizationId: 'org-1',
      role: 'Owner',
      assignedStationIds: ['station-1'],
    });
    await next();
  });
  instance.route('/shifts', shiftsRouter);
  return instance;
}

async function send(method: string, path: string, body: string | undefined) {
  const res = await app().request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body }),
  });
  const text = await res.text();
  // Deliberately tolerant: whether the body parses at all is the thing under
  // test, so an unparseable response is a result rather than a crash.
  const parsed: any = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  return { status: res.status, parsed, text };
}

/** Every route in the family that takes an id from the body. */
const ID_ROUTES: ReadonlyArray<[string, string, string]> = [
  ['POST', '/shifts/close', 'shiftId'],
  ['POST', '/shifts/reopen', 'shiftId'],
  ['POST', '/shifts/lock', 'shiftId'],
  ['PUT', '/shifts/readings', 'shiftId'],
  ['POST', '/shifts/handovers', 'shiftId'],
  ['POST', '/shifts/open', 'stationId'],
  ['POST', '/shifts/business-day/open', 'stationId'],
  ['POST', '/shifts/business-day/close', 'stationId'],
];

describe('POST /shifts/close with a malformed body', () => {
  it('answers 400 in the envelope, not a bare 500', async () => {
    const { status, parsed } = await send('POST', '/shifts/close', '{}');

    expect(status).toBe(400);
    expect(parsed).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('says which field is wrong', async () => {
    const { parsed } = await send('POST', '/shifts/close', '{}');

    expect(parsed.error.message).toMatch(/shiftId/);
  });

  it('never reaches the database', async () => {
    // The exploding fake would surface as a 500 if the request got through.
    const { status } = await send('POST', '/shifts/close', '{}');

    expect(status).not.toBe(500);
  });

  it.each([
    ['a null id', '{"shiftId":null}'],
    ['a numeric id', '{"shiftId":123}'],
    ['an empty id', '{"shiftId":""}'],
    ['a whitespace id', '{"shiftId":"   "}'],
    ['an object id', '{"shiftId":{"$ne":null}}'],
    ['no body at all', undefined],
    ['a body that is not JSON', 'not json'],
    ['a JSON array', '[]'],
  ])('rejects %s with a parseable envelope', async (_label, body) => {
    const { status, parsed, text } = await send('POST', '/shifts/close', body);

    expect(status, `body: ${String(body)}`).toBe(400);
    expect(parsed, `unparseable response body: ${text}`).not.toBeNull();
    expect(parsed.success).toBe(false);
  });
});

describe('every Shift route that takes an id from the body', () => {
  it.each(ID_ROUTES)('%s %s rejects a missing %s with 400', async (method, path) => {
    const { status, parsed } = await send(method, path, '{}');

    expect(status).toBe(400);
    expect(parsed?.error?.code).toBe('VALIDATION_ERROR');
  });

  it.each(ID_ROUTES)('%s %s rejects a non-string %s with 400', async (method, path, field) => {
    const { status, parsed } = await send(method, path, JSON.stringify({ [field]: 42 }));

    expect(status).toBe(400);
    expect(parsed?.error?.code).toBe('VALIDATION_ERROR');
  });

  it.each(ID_ROUTES)('%s %s always answers in the envelope', async (method, path) => {
    // The shape of the failure matters as much as the status: a client that
    // cannot parse the body cannot tell the operator what went wrong.
    const { parsed, text } = await send(method, path, '{"unexpected":true}');

    expect(parsed, `unparseable response body: ${text}`).not.toBeNull();
    expect(typeof parsed.success).toBe('boolean');
  });
});

describe('valid input still gets past validation', () => {
  it('lets a well-formed close through to the handler', async () => {
    // Reaching the exploding fake is the proof: the schema accepted the body
    // and the route proceeded, so the guard is not simply refusing everything.
    const { status } = await send('POST', '/shifts/close', '{"shiftId":"shift-1"}');

    expect(status).toBe(500);
  });

  it('trims but does not reject a padded id', async () => {
    const { status } = await send('POST', '/shifts/close', '{"shiftId":" shift-1 "}');

    expect(status).toBe(500);
  });
});
