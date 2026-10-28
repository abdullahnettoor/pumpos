// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanup, render, screen } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from './ConfirmDialog.js';

afterEach(cleanup);

const Ask: React.FC = () => {
  const confirm = useConfirm();
  useEffect(() => {
    void confirm({ title: 'Void this entry?' });
  }, [confirm]);
  return null;
};

describe('ConfirmDialog scrim (#604)', () => {
  it('blurs the page behind a dialog, on top of the scrim, from tokens', async () => {
    render(
      <ConfirmProvider>
        <Ask />
      </ConfirmProvider>,
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Void this entry?' });
    const scrim = dialog.parentElement!;
    expect(scrim.className).toContain('bg-(--overlay-scrim)');
    expect(scrim.className).toContain('backdrop-blur-(--overlay-blur)');
    // Still above drawers: a confirm is often asked from inside one.
    expect(scrim.className).toContain('z-[1100]');
    expect(scrim.getAttribute('style')).toBeNull();
  });
});
