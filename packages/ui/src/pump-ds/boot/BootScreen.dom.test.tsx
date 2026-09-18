/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BootScreen } from './index.js';

/**
 * The boot screen is the first thing an operator sees after pressing Sign In,
 * and for a cold sign-in on a station connection it is on screen for real
 * seconds. What it must never do is leak how the software is built.
 */
describe('BootScreen', () => {
  it('speaks product language, not internal vocabulary', () => {
    render(<BootScreen />);

    expect(screen.getByText('Signing you in…')).toBeTruthy();
  });

  it('names no vendor, subsystem or internal concept', () => {
    const { container } = render(<BootScreen />);
    const copy = container.textContent ?? '';

    // The four screens this replaces said "Initializing connection to Supabase
    // Auth...", "Resolving operational permissions...", and "Connecting…".
    // An operator has no idea what a Supabase or a permission resolver is, and
    // "resolving permissions" reads like it is about to refuse them entry.
    for (const jargon of [
      'Supabase',
      'Auth',
      'permission',
      'Initializing',
      'Resolving',
      'operational',
      'session',
      'token',
      'API',
    ]) {
      expect(copy.toLowerCase()).not.toContain(jargon.toLowerCase());
    }
  });

  it('shows the brand mark, so the wait is recognisably PumpOS', () => {
    const { container } = render(<BootScreen />);

    const mark = container.querySelector('svg');
    expect(mark).toBeTruthy();
    // The mark is decorative here — the copy already carries the message, so a
    // screen reader should not announce the logo as well.
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the existing spinner primitive rather than a second spinner', () => {
    const { container } = render(<BootScreen />);

    // .loading-spinner is the one primitive the reduced-motion block in
    // index.css slows down. A bespoke spinner here would silently opt out of
    // that, which is why this asserts the class and not merely "something spins".
    expect(container.querySelector('.loading-spinner')).toBeTruthy();
  });

  it('lets a caller state which phase is in progress', () => {
    render(<BootScreen message="Getting your station ready…" />);

    expect(screen.getByText('Getting your station ready…')).toBeTruthy();
  });

  it('announces itself politely, so the wait is not silent to a screen reader', () => {
    const { container } = render(<BootScreen />);

    const live = container.querySelector('[role="status"]');
    expect(live).toBeTruthy();
    expect(live?.getAttribute('aria-live')).toBe('polite');
  });

  it('fills the viewport, so no half-painted chrome shows behind it', () => {
    const { container } = render(<BootScreen />);

    // dvh rather than vh: on mobile this is the screen behind the browser's
    // collapsing toolbar, and vh would leave the mark sitting off-centre.
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('min-h-[100dvh]');
  });
});
