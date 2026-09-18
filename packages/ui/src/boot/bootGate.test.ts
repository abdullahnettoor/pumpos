import { describe, expect, it } from 'vitest';
import type { Role } from '@pump/shared';
import { selectBootGate } from './bootGate.js';

const base = {
  hasSession: false,
  loading: false,
  userRole: null as Role | null,
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
    expect(selectBootGate({ ...base, hasSession: true, loading: true })).toBe('boot');
  });

  it('draws the shell as soon as the role lands, without waiting for stations', () => {
    // The point of the change, for an app that can host a pre-ready station:
    // stations are still in flight and the shell renders anyway, with
    // skeletons inside it.
    expect(
      selectBootGate({
        ...base,
        hasSession: true,
        userRole: 'Owner' as Role,
        stationsLoading: true,
        notReadyTakesOver: false,
      }),
    ).toBe('shell');
  });

  it('does not mistake a still-loading station list for an unonboarded station', () => {
    // Without this, every sign-in flashes the onboarding takeover in the gap
    // between the role arriving and the station list arriving. Whether the wait
    // is spent on the boot screen or inside the shell is the app's choice; what
    // must never happen is the takeover firing on a list we have not got.
    const gate = selectBootGate({
      ...base,
      hasSession: true,
      userRole: 'Owner' as Role,
      stationsLoading: true,
      stationReady: false,
    });

    expect(gate).not.toBe('takeover');
  });

  it('hands over the full page once stations confirm the station is not ready', () => {
    expect(
      selectBootGate({
        ...base,
        hasSession: true,
        userRole: 'Owner' as Role,
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
        hasSession: true,
        userRole: 'Owner' as Role,
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
    expect(selectBootGate({ ...base, hasSession: true, userRole: null, profileError: true })).toBe(
      'takeover',
    );
  });

  it('keeps showing the error after a retry puts loading back on', () => {
    expect(selectBootGate({ ...base, hasSession: true, loading: true, profileError: true })).toBe(
      'takeover',
    );
  });
});

describe('selectBootGate where a pre-ready station takes the page over', () => {
  const desktop = {
    ...base,
    hasSession: true,
    userRole: 'Owner' as Role,
    notReadyTakesOver: true,
  };

  it('waits rather than drawing a shell it may have to tear down', () => {
    // Desktop hands a pre-ready station to a full-page notice. If it drew the
    // shell while the list was unknown, an un-onboarded operator would watch a
    // complete operational shell paint and then be destroyed — a worse pop
    // than the one this ticket set out to remove.
    //
    // Waiting is cheap here: the station list is static-tier and persisted, so
    // a returning operator has it before the session call even returns, and a
    // cold one now waits max(session, stations) rather than the old sum.
    expect(selectBootGate({ ...desktop, stationsLoading: true })).toBe('boot');
  });

  it('draws the shell once the list confirms the station is operational', () => {
    expect(selectBootGate({ ...desktop, stationsLoading: false, stationReady: true })).toBe(
      'shell',
    );
  });

  it('still lets an app that hosts onboarding render the shell straight away', () => {
    // The console can render early with no such risk: a pre-ready station stays
    // inside its shell, so there is nothing to tear down.
    expect(selectBootGate({ ...desktop, notReadyTakesOver: false, stationsLoading: true })).toBe(
      'shell',
    );
  });
});
