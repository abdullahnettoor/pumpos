// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UnsavedSectionsBar, UnsavedSectionsProvider } from './UnsavedSections.js';
import { useUnsavedSection } from './useUnsavedSection.js';
import { __resetUnsavedChangesForTests, hasUnsavedChanges } from './unsavedChanges.js';

afterEach(() => {
  cleanup();
  __resetUnsavedChangesForTests();
});

const Section: React.FC<{ id: string; persist: (v: string) => Promise<void> }> = ({
  id,
  persist,
}) => {
  const [saved, setSaved] = useState('a');
  const [value, setValue] = useState('a');
  const s = useUnsavedSection(id, {
    label: id,
    dirty: value !== saved,
    submit: async () => {
      await persist(value);
      setSaved(value);
    },
    discard: () => setValue(saved),
  });
  return (
    <div>
      <input aria-label={id} value={value} onChange={(e) => setValue(e.target.value)} />
      {s.error && <p role="alert">{`${id}: ${s.error}`}</p>}
    </div>
  );
};

describe('one bar for a tab with several sections (#604 review)', () => {
  it('names how many sections changed, saves each in turn, and shows a failure per section', async () => {
    const order: string[] = [];
    const ok = vi.fn(async (v: string) => {
      order.push(`tanks:${v}`);
    });
    const fail = vi.fn(async (v: string) => {
      order.push(`decantation:${v}`);
      throw new Error('Server said no');
    });
    render(
      <UnsavedSectionsProvider>
        <Section id="tanks" persist={ok} />
        <Section id="decantation" persist={fail} />
        <UnsavedSectionsBar />
      </UnsavedSectionsProvider>,
    );
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    fireEvent.change(screen.getByLabelText('tanks'), { target: { value: 'b' } });
    expect(screen.getByRole('region', { name: 'Unsaved changes' }).textContent).toContain(
      'Unsaved changes',
    );
    fireEvent.change(screen.getByLabelText('decantation'), { target: { value: 'c' } });
    expect(screen.getByText('2 sections changed')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
    expect(hasUnsavedChanges()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('decantation: Server said no'),
    );
    expect(order).toEqual(['tanks:b', 'decantation:c']);
    // The saved section is clean; the failed one stays changed.
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('Discard puts every section back', () => {
    render(
      <UnsavedSectionsProvider>
        <Section id="one" persist={async () => {}} />
        <Section id="two" persist={async () => {}} />
        <UnsavedSectionsBar />
      </UnsavedSectionsProvider>,
    );
    fireEvent.change(screen.getByLabelText('one'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('two'), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect((screen.getByLabelText('one') as HTMLInputElement).value).toBe('a');
    expect((screen.getByLabelText('two') as HTMLInputElement).value).toBe('a');
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
  });
});
