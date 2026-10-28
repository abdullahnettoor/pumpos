import { vi } from 'vite-plus/test';

/**
 * Test helper: make every element report `width` px to `useContainerWidth`
 * (jsdom has no layout). Returns `setWidth` to resize and fire observers, and
 * `restore` to undo. Call after the test environment is set up, e.g.
 *
 *   const stub = stubContainerWidth(1280);
 *   render(<DashboardBoard … />);
 *   act(() => stub.setWidth(900));
 *   afterEach(() => stub.restore());
 */
export function stubContainerWidth(initial: number) {
  let width = initial;
  const observers = new Set<{ cb: ResizeObserverCallback; el: Element }>();
  const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width,
    height: 0,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 0,
    toJSON() {},
  }));
  class FakeResizeObserver {
    private readonly cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      observers.add({ cb: this.cb, el });
    }
    unobserve() {}
    disconnect() {
      for (const o of observers) if (o.cb === this.cb) observers.delete(o);
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return {
    /** Wrap in `act()` when the component is mounted. */
    setWidth(next: number) {
      width = next;
      for (const { cb, el } of observers) {
        cb(
          [{ target: el, contentRect: { width: next } } as unknown as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      }
    },
    restore() {
      rect.mockRestore();
      vi.unstubAllGlobals();
      observers.clear();
    },
  };
}
