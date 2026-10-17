// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UnsavedChangesBar } from './UnsavedChangesBar.js';

afterEach(cleanup);

describe('UnsavedChangesBar (#604)', () => {
  it('renders nothing while the form is clean', () => {
    const { container } = render(<UnsavedChangesBar dirty={false} onDiscard={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('reads "Unsaved changes · Discard · Save", with Save the submit and the primary', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onDiscard = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <UnsavedChangesBar dirty onDiscard={onDiscard} />
      </form>,
    );
    const bar = screen.getByRole('region', { name: 'Unsaved changes' });
    expect(bar.textContent).toBe('Unsaved changesDiscardSave');
    expect(bar.className).toMatch(/(^|\s)sticky(\s|$)/);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.getAttribute('type')).toBe('submit');
    expect(save.className).toContain('bg-brand');
    const discard = screen.getByRole('button', { name: 'Discard' });
    expect(discard.getAttribute('type')).toBe('button');
    fireEvent.click(discard);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('holds Discard while a save is in flight', () => {
    render(<UnsavedChangesBar dirty saving onDiscard={() => {}} saveLabel="Save changes" />);
    expect((screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: /Save changes/ })).toBeTruthy();
  });
});
