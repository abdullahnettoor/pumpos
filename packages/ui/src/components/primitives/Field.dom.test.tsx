/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Field, TextInput } from './Field.js';

describe('Field', () => {
  afterEach(cleanup);

  it('names a required field "(required)" for a screen reader; the asterisk is visual only', () => {
    render(
      <Field label="Amount" htmlFor="amt" required>
        <TextInput id="amt" />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Amount (required)' })).toBeTruthy();
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
  });

  it('adds nothing to an optional field', () => {
    render(
      <Field label="Notes" htmlFor="notes">
        <TextInput id="notes" />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeTruthy();
    expect(screen.queryByText('(required)')).toBeNull();
  });
});
