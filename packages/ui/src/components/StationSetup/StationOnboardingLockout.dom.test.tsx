/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StationOnboardingLockout } from './StationOnboardingLockout.js';

afterEach(cleanup);

/**
 * Shown to the roles that cannot finish station setup. They have nothing to do
 * here, which is exactly why the screen has to offer a way out: on the console
 * it can render as a focused full page, outside the shell that would otherwise
 * carry the sign-out in its top bar (#132).
 */
describe('StationOnboardingLockout', () => {
  it('explains the wait without blaming the operator', () => {
    render(<StationOnboardingLockout onSignOut={() => {}} />);

    expect(screen.getByText(/Station setup in progress/i)).toBeTruthy();
  });

  it('always offers a sign-out, so the screen is never a dead end', () => {
    render(<StationOnboardingLockout onSignOut={() => {}} />);

    expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
  });

  it('signs the operator out when that button is used', async () => {
    const onSignOut = vi.fn();
    render(<StationOnboardingLockout onSignOut={onSignOut} />);

    screen.getByRole('button', { name: /sign out/i }).click();

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the sign-out even when it renders inside the shell', () => {
    // The shell's top bar has its own sign-out, so this one is redundant there
    // — but "redundant" is the right trade against a second route appearing
    // later that renders this bare again and silently reopens the dead end.
    render(<StationOnboardingLockout onSignOut={() => {}} inShell />);

    expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
  });

  it('fills the viewport only when it stands alone', () => {
    const bare = render(<StationOnboardingLockout onSignOut={() => {}} />);
    const bareRoot = bare.container.firstElementChild as HTMLElement;
    expect(bareRoot.className).toContain('min-h-[100dvh]');
    cleanup();

    const inShell = render(<StationOnboardingLockout onSignOut={() => {}} inShell />);
    const shellRoot = inShell.container.firstElementChild as HTMLElement;
    expect(shellRoot.className).not.toContain('min-h-[100dvh]');
  });
});
