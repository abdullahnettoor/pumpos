// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GettingStartedChecklist, type ChecklistStep } from './GettingStartedChecklist.js';
import { useChecklistSkips } from './checklistStorage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

const OPTIONAL = ['team', 'suppliers'];

const Harness: React.FC = () => {
  const { skipped, skip, undoSkip } = useChecklistSkips();
  const base: ChecklistStep[] = [
    {
      id: 'org',
      label: 'Org',
      description: '',
      done: true,
      actionLabel: 'Done',
      onAction: vi.fn(),
    },
    {
      id: 'station',
      label: 'Station',
      description: '',
      done: false,
      actionLabel: 'Onboard',
      onAction: vi.fn(),
    },
    {
      id: 'team',
      label: 'Team',
      description: '',
      done: false,
      actionLabel: 'Invite',
      onAction: vi.fn(),
    },
    {
      id: 'suppliers',
      label: 'Suppliers',
      description: '',
      done: false,
      actionLabel: 'Add',
      onAction: vi.fn(),
    },
  ];
  const steps = base.map((s) =>
    OPTIONAL.includes(s.id)
      ? {
          ...s,
          skippable: true,
          skipped: skipped.includes(s.id),
          onSkip: () => skip(s.id),
          onUndoSkip: () => undoSkip(s.id),
        }
      : s,
  );
  return <GettingStartedChecklist steps={steps} />;
};

describe('GettingStartedChecklist skipping', () => {
  it('offers Skip on optional steps only', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Skip Team' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip Station' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Skip Org' })).toBeNull();
  });

  it('counts a skipped step toward progress and lets you undo it', () => {
    render(<Harness />);
    expect(screen.getByText('1 of 4 done')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip Team' }));
    expect(screen.getByText('2 of 4 done')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo skip' }));
    expect(screen.getByText('1 of 4 done')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip Team' })).toBeTruthy();
  });

  it('keeps a skip after the checklist remounts', () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip Suppliers' }));
    unmount();
    render(<Harness />);
    expect(screen.getByText('2 of 4 done')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo skip' })).toBeTruthy();
  });
});
