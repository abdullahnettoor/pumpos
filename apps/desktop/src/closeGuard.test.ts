import { describe, expect, it, vi } from 'vitest';
import { shouldCloseWindow } from './closeGuard.js';

describe('desktop close guard (#604)', () => {
  it('closes at once with nothing unsaved, without asking', async () => {
    const confirm = vi.fn();
    expect(await shouldCloseWindow(() => false, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks when something is unsaved, and closes only on confirm', async () => {
    expect(
      await shouldCloseWindow(
        () => true,
        async () => false,
      ),
    ).toBe(false);
    expect(
      await shouldCloseWindow(
        () => true,
        async () => true,
      ),
    ).toBe(true);
  });
});
