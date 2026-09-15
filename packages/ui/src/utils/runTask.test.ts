import { describe, expect, it, vi } from 'vitest';
import { runTask } from './runTask.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runTask', () => {
  it('routes a rejection to the handler instead of losing it', async () => {
    const onError = vi.fn();
    const boom = new Error('network down');

    runTask(Promise.reject(boom), onError);
    await flush();

    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('leaves a resolving task alone', async () => {
    const onError = vi.fn();

    runTask(Promise.resolve('ok'), onError);
    await flush();

    expect(onError).not.toHaveBeenCalled();
  });

  // The point of the helper: a rejection must not escape as an unhandled
  // rejection, which is what made these failures invisible in the first place.
  it('does not leave the rejection unhandled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    runTask(Promise.reject(new Error('boom')), () => {});
    await flush();

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
