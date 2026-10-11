// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PausedReason, usePausedAction } from './PausedAction.js';
import { SheetButtons } from './SheetButtons.js';

const Action: React.FC<{ reason?: string | null; onPress: () => void }> = ({ reason, onPress }) => {
  const gate = usePausedAction(reason);
  return (
    <>
      <button type="button" {...gate.buttonProps(onPress)}>
        Do it
      </button>
      {gate.reason && <PausedReason id={gate.reasonId}>{gate.reason}</PausedReason>}
    </>
  );
};

afterEach(cleanup);

describe('usePausedAction', () => {
  it('runs the handler while available', () => {
    const onPress = vi.fn();
    render(<Action onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('keeps a paused action focusable, inert, and described by its reason', () => {
    const onPress = vi.fn();
    render(<Action reason="Paused while suspended." onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Do it' });
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toBe(
      screen.getByText('Paused while suspended.').id,
    );
  });
});

describe('SheetButtons', () => {
  it('shows the busy label and disables the submit while saving', () => {
    render(
      <SheetButtons
        onCancel={() => {}}
        submitLabel="Save"
        busyLabel="Saving…"
        busy
        disabled={false}
      />,
    );
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('cancels, and disables the submit when there is nothing to save', () => {
    const onCancel = vi.fn();
    render(
      <SheetButtons
        onCancel={onCancel}
        submitLabel="Save"
        busyLabel="Saving…"
        busy={false}
        disabled
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
