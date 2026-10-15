// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  MAX_TOASTS,
  TOAST_DURATION_MS,
  ToastProvider,
  pushToast,
  useToast,
  withNextStep,
  type ToastApi,
} from './ToastProvider.js';

/** The toast host (#606): one bottom-centre stack, successes leave, errors stay. */
const Grab: React.FC<{ onApi: (api: ToastApi) => void }> = ({ onApi }) => {
  const toast = useToast();
  React.useEffect(() => onApi(toast), [onApi, toast]);
  return null;
};
let api!: ToastApi;
const mount = () =>
  render(
    <ToastProvider>
      <Grab
        onApi={(a) => {
          api = a;
        }}
      />
    </ToastProvider>,
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ToastProvider (#606)', () => {
  it('a success leaves after four seconds; an error stays until dismissed', () => {
    vi.useFakeTimers();
    mount();
    act(() => {
      api.success('Expense recorded.');
      api.error('Shift not opened. Check the form and open the shift again.');
    });
    expect(screen.getByRole('status').textContent).toContain('Expense recorded.');

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS + 1));
    expect(screen.queryByRole('status')).toBeNull();
    const error = screen.getByRole('alert');

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('alert')).toBe(error);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('runs an action and dismisses the toast', () => {
    mount();
    const onClick = vi.fn();
    act(() => api.success('Expense recorded.', { action: { label: 'View expenses', onClick } }));
    fireEvent.click(screen.getByRole('button', { name: 'View expenses' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it(`keeps one stack of at most ${MAX_TOASTS}, newest last`, () => {
    mount();
    act(() => {
      for (let i = 1; i <= 5; i += 1) api.info(`Note ${i}`);
    });
    expect(screen.getAllByRole('status').map((t) => t.textContent)).toEqual([
      'Note 3',
      'Note 4',
      'Note 5',
    ]);
    expect(pushToast([1, 2, 3], 4)).toEqual([2, 3, 4]);
  });

  it('sits bottom centre, above the status bar, with no inline style', () => {
    mount();
    const host = screen.getByLabelText('Notifications');
    expect(host.className).toContain('bottom-[calc(var(--toast-offset)+12px)]');
    expect(host.className).toContain('left-1/2');
    expect(host.getAttribute('style')).toBeNull();
  });
});

describe('withNextStep', () => {
  it('ends the reason with a full stop, then says what to do', () => {
    expect(withNextStep('Account is closed', 'Choose another.')).toBe(
      'Account is closed. Choose another.',
    );
    expect(withNextStep('Shift is closed.', 'Try again.')).toBe('Shift is closed. Try again.');
    expect(withNextStep(undefined, 'Try again.')).toBe('Try again.');
  });
});
