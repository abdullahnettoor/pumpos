/**
 * @vitest-environment jsdom
 */
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { OnboardingWizard } from './OnboardingWizard.js';
import {
  createEmptyOnboardingDraft,
  loadStoredOnboardingDraft,
  saveStoredOnboardingDraft,
} from './onboardingDraft.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const renderWizard = () =>
  renderWithProviders(<OnboardingWizard onOnboardingComplete={() => {}} userName="Asha Menon" />);

describe('OnboardingWizard start', () => {
  it('shows the intro on a fresh start, then saves the empty draft at step 1', () => {
    renderWizard();

    expect(screen.getByText("Let's set up your station")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start setup' })).toBeTruthy();
    expect(loadStoredOnboardingDraft()).toEqual({
      draft: expect.any(Object),
      currentStep: 1,
    });
  });

  it('resumes a stored draft at its step, skipping the intro', () => {
    const draft = createEmptyOnboardingDraft();
    draft.station.name = 'Apex Fuels';
    saveStoredOnboardingDraft({ draft, currentStep: 3 });

    renderWizard();

    expect(screen.queryByRole('button', { name: 'Start setup' })).toBeNull();
    expect(screen.getByText(/^Step 3 of 9 ·/)).toBeTruthy();
    expect(loadStoredOnboardingDraft()?.draft.station.name).toBe('Apex Fuels');
  });

  it.each([
    [42, 9],
    [0, 1],
    [-2, 1],
  ])('clamps a stored step of %i to step %i', (stored, shown) => {
    saveStoredOnboardingDraft({ draft: createEmptyOnboardingDraft(), currentStep: stored });

    renderWizard();

    expect(screen.getByText(new RegExp(`^Step ${shown} of 9 ·`))).toBeTruthy();
  });
});
