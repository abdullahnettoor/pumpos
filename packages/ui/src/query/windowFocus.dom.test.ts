// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { QueryObserver } from '@tanstack/react-query';
import { createQueryClient } from './queryClient.js';
import { windowFocusListener } from './windowFocus.js';

describe('windowFocusListener', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00Z') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a focus when the window gets focus, not only on visibilitychange', () => {
    const onFocus = vi.fn();
    const stop = windowFocusListener(onFocus);
    window.dispatchEvent(new Event('focus'));
    expect(onFocus).toHaveBeenCalledTimes(1);
    stop();
  });

  it('reports one focus when focus and visibilitychange arrive together', () => {
    const onFocus = vi.fn();
    const stop = windowFocusListener(onFocus);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    expect(onFocus).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_500);
    window.dispatchEvent(new Event('focus'));
    expect(onFocus).toHaveBeenCalledTimes(2);
    stop();
  });

  it('ignores a visibilitychange to hidden', () => {
    const onFocus = vi.fn();
    const stop = windowFocusListener(onFocus);
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    expect(onFocus).not.toHaveBeenCalled();
    spy.mockRestore();
    stop();
  });

  it('stops listening once cleaned up', () => {
    const onFocus = vi.fn();
    windowFocusListener(onFocus)();
    window.dispatchEvent(new Event('focus'));
    expect(onFocus).not.toHaveBeenCalled();
  });
});

describe('createQueryClient', () => {
  it('refetches stale live data when the app window regains focus', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00Z') });
    const client = createQueryClient();
    client.mount(); // QueryClientProvider does this in the app
    const fetch = vi.fn().mockResolvedValue('ok');
    const observer = new QueryObserver(client, { queryKey: ['live'], queryFn: fetch });
    const stop = observer.subscribe(() => {});
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('focus')); // still fresh (< 15s): no refetch
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(16_000);
    window.dispatchEvent(new Event('focus')); // stale: one refetch
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    stop();
    client.unmount();
    vi.useRealTimers();
  });
});
