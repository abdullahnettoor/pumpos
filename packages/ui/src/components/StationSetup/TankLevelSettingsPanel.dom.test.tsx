// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TANK_LEVEL_SETTINGS } from '@pump/shared';
import {
  TankLevelSettingsPanel,
  type TankLevelSettingsPanelProps,
} from './TankLevelSettingsPanel.js';
import { UnsavedSectionsBar, UnsavedSectionsProvider } from '../../pump-ds/index.js';
import { __resetUnsavedChangesForTests } from '../../pump-ds/form/unsavedChanges.js';

// The panel is a section of its tab's one bar (#604).
const Panel = (props: TankLevelSettingsPanelProps) => (
  <UnsavedSectionsProvider>
    <TankLevelSettingsPanel {...props} />
    <UnsavedSectionsBar />
  </UnsavedSectionsProvider>
);

afterEach(() => {
  cleanup();
  __resetUnsavedChangesForTests();
});

const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

describe('TankLevelSettingsPanel (#520)', () => {
  it('shows the station values and saves a valid change', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Panel value={DEFAULT_TANK_LEVEL_SETTINGS} canEdit onSave={onSave} />);

    expect(input(/Critical below/).value).toBe('25');
    expect(input(/Low below/).value).toBe('40');

    fireEvent.change(input(/Critical below/), { target: { value: '15' } });
    fireEvent.change(input(/Low below/), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ criticalBelowPct: 15, lowBelowPct: 35 }),
    );
  });

  it('shows Save only once a threshold changes; Discard restores and renews the key (#604)', () => {
    const onDiscard = vi.fn();
    render(
      <Panel value={DEFAULT_TANK_LEVEL_SETTINGS} canEdit onSave={vi.fn()} onDiscard={onDiscard} />,
    );
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.change(input(/Critical below/), { target: { value: '15' } });
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(input(/Critical below/).value).toBe('25');
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('refuses a critical threshold at or above low', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Panel value={DEFAULT_TANK_LEVEL_SETTINGS} canEdit onSave={onSave} />);

    fireEvent.change(input(/Critical below/), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Critical must be below low')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is read-only without the right', () => {
    render(
      <Panel value={{ criticalBelowPct: 10, lowBelowPct: 30 }} canEdit={false} onSave={vi.fn()} />,
    );

    expect(input(/Critical below/).value).toBe('10');
    expect(input(/Critical below/).matches(':disabled')).toBe(true);
    expect(input(/Low below/).matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText('Only an Owner or Manager can change tank levels.')).toBeTruthy();
  });
});
