// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRoutePath } from './useRoutePath.js';
import { ConfirmProvider } from '../components/primitives/ConfirmDialog.js';
import {
  __resetUnsavedChangesForTests,
  useUnsavedChangesGuard,
} from '../pump-ds/form/unsavedChanges.js';

afterEach(() => {
  cleanup();
  __resetUnsavedChangesForTests();
  window.history.replaceState(null, '', '/');
});

const nav: { go: (path: string) => void } = { go: () => {} };
const go = (path: string) => nav.go(path);
const App: React.FC<{ dirty: boolean }> = ({ dirty }) => {
  const [path, navigate] = useRoutePath('/dashboard');
  useEffect(() => {
    nav.go = navigate;
  });
  useUnsavedChangesGuard(dirty, () => {});
  return <p data-testid="path">{path}</p>;
};

describe('a route change with unsaved changes asks first (#604)', () => {
  it('moves at once when nothing is unsaved', () => {
    render(
      <ConfirmProvider>
        <App dirty={false} />
      </ConfirmProvider>,
    );
    act(() => go('/customers'));
    expect(screen.getByTestId('path').textContent).toBe('/customers');
  });

  it('stays on Keep editing, moves on Discard changes', async () => {
    render(
      <ConfirmProvider>
        <App dirty />
      </ConfirmProvider>,
    );
    act(() => go('/customers'));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByTestId('path').textContent).toBe('/dashboard');
    act(() => go('/customers'));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/customers'));
  });
});
