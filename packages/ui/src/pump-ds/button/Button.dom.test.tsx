// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Button } from './Button.js';

afterEach(cleanup);

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('Button with an async onClick', () => {
  // The point of issue #42: a handler that kicks off long work must not leave
  // the control looking like the work already finished.
  it('stays busy and unclickable until the work settles', async () => {
    const work = deferred();
    const onClick = vi.fn(() => work.promise);

    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    expect((button as HTMLButtonElement).disabled).toBe(true);

    // A second click while in flight must not start the work again.
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    work.resolve();
    await waitFor(() => expect(button.getAttribute('aria-busy')).toBeNull());
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports a rejection and returns the button to interactive', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('server said no');
    const onClickError = vi.fn();

    render(
      <Button onClick={() => Promise.reject(boom)} onClickError={onClickError}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => expect(onClickError).toHaveBeenCalledWith(boom));
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    consoleError.mockRestore();
  });

  it('leaves a synchronous onClick completely alone', () => {
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-busy')).toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  // A submit usually closes the drawer that owns the button, so the promise
  // settles after unmount. That must not warn or throw.
  it('survives settling after unmount', async () => {
    const work = deferred();
    const { unmount } = render(<Button onClick={() => work.promise}>Save</Button>);

    fireEvent.click(screen.getByRole('button'));
    unmount();
    work.resolve();

    await expect(work.promise).resolves.toBeUndefined();
  });
});
