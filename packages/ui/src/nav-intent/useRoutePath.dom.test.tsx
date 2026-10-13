import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRoutePath } from './useRoutePath.js';
import { LEGACY_ROUTES } from './routes.js';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useRoutePath', () => {
  it('falls back to the default when the URL names no page', () => {
    const { result } = renderHook(() => useRoutePath('/dashboard'));
    expect(result.current[0]).toBe('/dashboard');
  });

  it('restores the page from the URL after a reload', () => {
    window.history.replaceState(null, '', '/#/shifts');
    const { result } = renderHook(() => useRoutePath('/dashboard'));
    expect(result.current[0]).toBe('/shifts');
  });

  it('writes navigation to the URL so a reload lands on the same page', () => {
    const { result, unmount } = renderHook(() => useRoutePath('/dashboard'));
    act(() => result.current[1]('/inventory'));
    expect(window.location.hash).toBe('#/inventory');
    unmount();

    const reloaded = renderHook(() => useRoutePath('/dashboard'));
    expect(reloaded.result.current[0]).toBe('/inventory');
  });

  it('accepts an updater and never puts /login in the URL', () => {
    const { result } = renderHook(() => useRoutePath('/dashboard'));
    act(() => result.current[1]('/reports'));
    act(() => result.current[1]('/login'));
    expect(result.current[0]).toBe('/login');
    expect(window.location.hash).toBe('#/reports');
    act(() => result.current[1]((prev) => (prev === '/login' ? '/reports' : prev)));
    expect(result.current[0]).toBe('/reports');
  });

  it('follows browser back/forward', () => {
    const { result } = renderHook(() => useRoutePath('/dashboard'));
    act(() => result.current[1]('/shifts'));
    act(() => {
      window.history.replaceState(null, '', '/#/sales');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current[0]).toBe('/sales');
  });

  describe('renamed routes', () => {
    it.each(Object.entries(LEGACY_ROUTES))('a reload of #%s lands on %s', (oldPath, newPath) => {
      window.history.replaceState(null, '', `/#${oldPath}`);
      const { result } = renderHook(() => useRoutePath('/dashboard'));
      expect(result.current[0]).toBe(newPath);
      expect(window.location.hash).toBe(`#${newPath}`);
    });

    it('rewrites the old hash in place rather than adding a history entry', () => {
      window.history.replaceState(null, '', '/#/purchases');
      const before = window.history.length;
      renderHook(() => useRoutePath('/dashboard'));
      expect(window.location.hash).toBe('#/suppliers');
      expect(window.history.length).toBe(before);
    });

    it('resolves a navigation to an old route', () => {
      const { result } = renderHook(() => useRoutePath('/dashboard'));
      act(() => result.current[1]('/purchases'));
      expect(result.current[0]).toBe('/suppliers');
      expect(window.location.hash).toBe('#/suppliers');
    });

    it('resolves an old route reached by back/forward', () => {
      const { result } = renderHook(() => useRoutePath('/dashboard'));
      act(() => {
        window.history.replaceState(null, '', '/#/purchases');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      expect(result.current[0]).toBe('/suppliers');
    });
  });
});
