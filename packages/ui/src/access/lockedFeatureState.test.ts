import { describe, expect, it } from 'vitest';
import type { AccessDocument } from '@pump/shared';
import {
  lockedFeatureLocked,
  lockedFeatureState,
  lockedFeatureVisible,
  lockedPlanLine,
  planName,
  pumposContactHref,
} from './lockedFeatureState.js';

const doc = (
  capabilities: AccessDocument['capabilities'],
  plan: 'CORE' | null = 'CORE',
): AccessDocument =>
  ({
    ...(plan ? { plan } : {}),
    capabilities,
    limits: { station_count: { value: 1, used: 1, reached: true } },
    subscription: {
      status: 'ACTIVE',
      mode: 'NORMAL',
      accessUntil: null,
      showWarning: false,
      warningMessage: null,
      resolution: null,
    },
  }) as AccessDocument;

const UPGRADE = {
  enabled: false,
  title: 'Tally export',
  visibility: 'UPGRADE' as const,
  unavailableMessage: 'Not in your plan.',
  resolution: 'CONTACT_PUMPOS' as const,
};

describe('lockedFeatureState (#605)', () => {
  it('is enabled when the Organization has it', () => {
    expect(lockedFeatureState(doc({ 'x.y': { enabled: true, title: 'X' } }), 'x.y')).toEqual({
      status: 'enabled',
    });
  });

  it('tells an Owner or Manager (a disabled entry) the plan', () => {
    expect(lockedFeatureState(doc({ 'x.y': UPGRADE }), 'x.y')).toEqual({
      status: 'upgrade',
      title: 'Tally export',
      message: 'Not in your plan.',
      plan: 'Core',
    });
  });

  it('tells any other Role (no plan, no entry) whom to ask', () => {
    expect(lockedFeatureState(doc({}, null), 'x.y')).toEqual({ status: 'ask' });
  });

  it('hides a capability an Owner is not offered, and everything on a cold start', () => {
    expect(lockedFeatureState(doc({}), 'x.y')).toEqual({ status: 'hidden' });
    expect(lockedFeatureState(undefined, 'x.y')).toEqual({ status: 'hidden' });
  });

  it('shows a nav entry unless hidden, with a lock when locked', () => {
    const states = [
      { status: 'enabled' },
      { status: 'upgrade', title: '', message: '', plan: null },
      { status: 'ask' },
      { status: 'hidden' },
    ] as const;
    expect(states.map(lockedFeatureVisible)).toEqual([true, true, true, false]);
    expect(states.map(lockedFeatureLocked)).toEqual([false, true, true, false]);
  });
});

describe('locked-feature words (#605)', () => {
  it('names the plan', () => {
    expect(planName('CORE')).toBe('Core');
    expect(planName('FLEET_PLUS')).toBe('Fleet Plus');
    expect(lockedPlanLine('Core')).toBe('Not included in your Core plan.');
    expect(lockedPlanLine(null)).toBe('Not included in your current plan.');
  });

  it('writes to PumpOS about the feature', () => {
    expect(pumposContactHref('Attendant Handover Report')).toBe(
      'mailto:hello@pumpos.app?subject=Enable%20Attendant%20Handover%20Report',
    );
  });
});
