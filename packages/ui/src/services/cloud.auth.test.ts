import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CloudStationService, CloudShiftService, setApiBaseUrl } from './cloud.js';
import { setTokenSource, setAuthToken, resetAuthTokenState } from './auth/tokenStore.js';

/** An API envelope, as the worker would return it. */
function envelope(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

const okResponse = (data: unknown, status = 200) => envelope({ success: true, data }, status);
const unauthorized = () =>
  envelope(
    {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired authentication token' },
    },
    401,
  );

function headersOf(call: any[]): Record<string, string> {
  return (call[1] as RequestInit).headers as Record<string, string>;
}

function bearerOf(call: any[]) {
  return headersOf(call).Authorization;
}

describe('cloud request auth', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleError: { mockRestore: () => void };

  beforeEach(() => {
    setApiBaseUrl('https://api.test');
    resetAuthTokenState();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleError.mockRestore();
    resetAuthTokenState();
  });

  it('sends the freshly-resolved token, not the snapshot pushed at sign-in', async () => {
    setAuthToken('stale-snapshot');
    setTokenSource({
      getToken: async () => 'fresh-token',
      refresh: async () => 'fresh-token',
    });
    fetchMock.mockResolvedValue(okResponse([]));

    await new CloudStationService().getStations();

    expect(bearerOf(fetchMock.mock.calls[0])).toBe('Bearer fresh-token');
  });

  it('refreshes once and replays the request when the token has expired', async () => {
    const refresh = vi.fn(async () => 'new-token');
    setTokenSource({ getToken: async () => 'expired-token', refresh });
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(okResponse([{ id: 's' }]));

    const stations = await new CloudStationService().getStations();

    expect(stations).toEqual([{ id: 's' }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bearerOf(fetchMock.mock.calls[0])).toBe('Bearer expired-token');
    expect(bearerOf(fetchMock.mock.calls[1])).toBe('Bearer new-token');
  });

  it('surfaces the error when the replay fails too — one retry, not a loop', async () => {
    setTokenSource({ getToken: async () => 'expired-token', refresh: async () => 'new-token' });
    fetchMock.mockResolvedValue(unauthorized());

    await expect(new CloudStationService().getStations()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the 401 as-is when the refresh fails — a signed-out user reaches login', async () => {
    const refresh = vi.fn(async () => null);
    setTokenSource({ getToken: async () => 'dead-token', refresh });
    fetchMock.mockResolvedValue(unauthorized());

    await expect(new CloudStationService().getStations()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight refresh across concurrent requests that hit the expired token', async () => {
    let release: (token: string) => void = () => {};
    const refresh = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    setTokenSource({ getToken: async () => 'expired-token', refresh });
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer expired-token' ? unauthorized() : okResponse([]);
    });

    const service = new CloudStationService();
    const all = Promise.all([service.getStations(), service.getStations(), service.getStations()]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    release('new-token');
    await all;

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reuses the original Idempotency-Key on the replay so a mutation cannot double-apply', async () => {
    setTokenSource({ getToken: async () => 'expired-token', refresh: async () => 'new-token' });
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(okResponse({ id: 'h1' }));

    await new CloudShiftService().recordHandover({ shiftId: 's1' } as any, {
      idempotencyKey: 'key-1',
    });

    const keys = fetchMock.mock.calls.map((call) => headersOf(call)['Idempotency-Key']);
    expect(keys).toEqual(['key-1', 'key-1']);
  });

  it('falls back to the last known token when the source read throws', async () => {
    setAuthToken('snapshot');
    setTokenSource({
      getToken: async () => {
        throw new Error('offline');
      },
      refresh: async () => null,
    });
    fetchMock.mockResolvedValue(okResponse([]));

    await new CloudStationService().getStations();

    expect(bearerOf(fetchMock.mock.calls[0])).toBe('Bearer snapshot');
  });
});
