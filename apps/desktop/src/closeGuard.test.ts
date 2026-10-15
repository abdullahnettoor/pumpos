import { describe, expect, it, vi } from 'vitest';
import { handleCloseRequest, shouldCloseWindow } from './closeGuard.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  it('lets Tauri close the window itself when nothing is unsaved', async () => {
    const destroy = vi.fn(async () => {});
    const hold = handleCloseRequest({
      unsaved: () => false,
      confirmDiscard: vi.fn(),
      destroy,
      report: vi.fn(),
    });
    expect(hold).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('reports a failed confirmation, keeps the window, and the next close still works', async () => {
    const destroy = vi.fn(async () => {});
    const report = vi.fn();
    let calls = 0;
    const confirmDiscard = async () => {
      calls += 1;
      if (calls === 1) throw new Error('dialog failed');
      return true;
    };
    const deps = { unsaved: () => true, confirmDiscard, destroy, report };

    expect(handleCloseRequest(deps)).toBe(true);
    await flush();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'dialog failed' }));
    expect(destroy).not.toHaveBeenCalled();

    expect(handleCloseRequest(deps)).toBe(true);
    await flush();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps the window when the operator chooses Keep editing', async () => {
    const destroy = vi.fn(async () => {});
    handleCloseRequest({
      unsaved: () => true,
      confirmDiscard: async () => false,
      destroy,
      report: vi.fn(),
    });
    await flush();
    expect(destroy).not.toHaveBeenCalled();
  });
});
