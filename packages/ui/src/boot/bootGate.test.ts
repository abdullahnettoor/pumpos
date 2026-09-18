import { describe, expect, it } from 'vitest';
import { selectBootGate } from './bootGate.js';

const base = {
  session: null as unknown,
  loading: false,
  userRole: null as string | null,
  profileError: false,
  stationsLoading: false,
  stationReady: false,
  notReadyTakesOver: true,
};

describe('selectBootGate', () => {
  it('waits on the branded screen before the first session check resolves', () => {
    expect(selectBootGate({ ...base, loading: true })).toBe('boot');
  });

  it('shows login once the check comes back with no session', () => {
    expect(selectBootGate({ ...base, loading: false })).toBe('takeover');
  });

  it('stays on the branded screen while the role is resolving', () => {
    // The single wait this whole ticket is about: one screen, held from the
    // moment the session exists until we know who the user is.
    expect(selectBootGate({ ...base, session: {}, loading: true })).toBe('boot');
  });

  it('draws the shell as soon as the role lands, without waiting for stations', () => {
    // The point of the change. Stations are still in flight here and the shell
    // renders anyway, with skeletons inside it.
    expect(selectBootGate({ ...base, session: {}, userRole: 'Owner', stationsLoading: true })).toBe(
      'shell',
    );
  });

  it('does not mistake a still-loading station list for an unonboarded station', () => {
    // Without this, every sign-in flashes the onboarding takeover in the gap
    // between the role arriving and the station list arriving.
    const gate = selectBootGate({
      ...base,
      session: {},
      userRole: 'Owner',
      stationsLoading: true,
      stationReady: false,
    });

    expect(gate).toBe('shell');
  });

  it('hands over the full page once stations confirm the station is not ready', () => {
    expect(
      selectBootGate({
        ...base,
        session: {},
        userRole: 'Owner',
        stationsLoading: false,
        stationReady: false,
      }),
    ).toBe('takeover');
  });

  it('keeps a pre-ready station inside the shell where onboarding is possible', () => {
    // The console is where onboarding happens, so it hosts a pre-ready station
    // in the shell (dashboard hero, organization hub) instead of taking the
    // page over the way desktop does. Flattening this difference would have
    // locked console users out of the wizard they were heading for.
    expect(
      selectBootGate({
        ...base,
        session: {},
        userRole: 'Owner',
        stationReady: false,
        notReadyTakesOver: false,
      }),
    ).toBe('shell');
  });

  it('gives a profile failure the full page, never the boot screen', () => {
    // The error card carries the sign-out escape hatch. Leaving a stuck user on
    // a spinner that never resolves is the worst outcome here, so this asserts
    // the failure wins over the still-no-role condition that would otherwise
    // hold the boot screen up forever.
    expect(selectBootGate({ ...base, session: {}, userRole: null, profileError: true })).toBe(
      'takeover',
    );
  });

  it('keeps showing the error after a retry puts loading back on', () => {
    expect(selectBootGate({ ...base, session: {}, loading: true, profileError: true })).toBe(
      'takeover',
    );
  });
});
