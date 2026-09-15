// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from './Form.js';

afterEach(cleanup);

describe('Form with an async onSubmit', () => {
  // react-hook-form's handleSubmit re-throws whatever the submit handler threw,
  // so on a bare <form> every submit failure became an unhandled rejection.
  it('routes a rejected submit to the error handler', async () => {
    const boom = new Error('save failed');
    const onSubmitError = vi.fn();

    render(
      <Form onSubmit={() => Promise.reject(boom)} onSubmitError={onSubmitError}>
        <button type="submit">Save</button>
      </Form>,
    );
    fireEvent.submit(screen.getByRole('button').closest('form')!);

    await waitFor(() => expect(onSubmitError).toHaveBeenCalledWith(boom));
  });

  it('reports submitting state around an async submit', async () => {
    let finish!: () => void;
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onSubmittingChange = vi.fn();

    render(
      <Form onSubmit={() => work} onSubmittingChange={onSubmittingChange}>
        <button type="submit">Save</button>
      </Form>,
    );
    fireEvent.submit(screen.getByRole('button').closest('form')!);

    expect(onSubmittingChange).toHaveBeenCalledWith(true);
    finish();
    await waitFor(() => expect(onSubmittingChange).toHaveBeenLastCalledWith(false));
  });

  it('does not report submitting for a synchronous submit', () => {
    const onSubmittingChange = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

    render(
      <Form onSubmit={onSubmit} onSubmittingChange={onSubmittingChange}>
        <button type="submit">Save</button>
      </Form>,
    );
    fireEvent.submit(screen.getByRole('button').closest('form')!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmittingChange).not.toHaveBeenCalled();
  });
});
