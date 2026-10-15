// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmProvider } from '../../components/primitives/ConfirmDialog.js';
import {
  __resetUnsavedChangesForTests,
  confirmDiscardUnsaved,
  guardLeave,
  hasUnsavedChanges,
  useUnsavedChangesGuard,
} from './unsavedChanges.js';

afterEach(() => {
  cleanup();
  __resetUnsavedChangesForTests();
});

const Editor: React.FC<{ onDiscard?: () => void }> = ({ onDiscard }) => {
  const [value, setValue] = useState('saved');
  const dirty = value !== 'saved';
  useUnsavedChangesGuard(dirty, () => {
    setValue('saved');
    onDiscard?.();
  });
  return <input aria-label="Field" value={value} onChange={(e) => setValue(e.target.value)} />;
};

const renderEditor = (onDiscard?: () => void) =>
  render(
    <ConfirmProvider>
      <Editor onDiscard={onDiscard} />
    </ConfirmProvider>,
  );

describe('unsaved-changes guard (#604)', () => {
  it('lets a leave through at once while nothing is changed', () => {
    renderEditor();
    const proceed = vi.fn();
    guardLeave(proceed);
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('asks before leaving a changed form; Keep editing stays', async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'edited' } });
    expect(hasUnsavedChanges()).toBe(true);
    const proceed = vi.fn();
    act(() => guardLeave(proceed));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' });
    expect(dialog).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(proceed).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Field') as HTMLInputElement).value).toBe('edited');
  });

  it('confirming discards the changes, then leaves', async () => {
    const onDiscard = vi.fn();
    renderEditor(onDiscard);
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'edited' } });
    const proceed = vi.fn();
    act(() => guardLeave(proceed));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText('Field') as HTMLInputElement).value).toBe('saved');
    expect(hasUnsavedChanges()).toBe(false);
  });

  it('blocks closing or reloading the tab while changed (beforeunload)', () => {
    renderEditor();
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'edited' } });
    expect(unload()).toBe(true);
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'saved' } });
    expect(unload()).toBe(false);
  });

  it('shares one dialog between leaves asked at once', async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'edited' } });
    let a!: Promise<boolean>;
    let b!: Promise<boolean>;
    act(() => {
      a = confirmDiscardUnsaved();
      b = confirmDiscardUnsaved();
    });
    expect(await screen.findAllByRole('alertdialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await a).toBe(true);
    expect(await b).toBe(true);
  });
});
