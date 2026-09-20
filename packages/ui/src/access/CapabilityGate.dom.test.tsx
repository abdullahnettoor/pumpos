/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type { AccessDocument, Role } from '@pump/shared';
import { capabilityState } from '@pump/shared';
import { QueryProvider } from '../query/queryClient.js';
import { queryKeys } from '../query/hooks.js';
import { CapabilityGate, CapabilityRoute } from './CapabilityGate.js';

/**
 * What an operator actually sees when their Organization lacks a feature.
 *
 * The server has already filtered the Access Document by Role, so these tests
 * feed the document each Role would really receive: Owners and Managers get a
 * disabled entry to explain, everyone else gets no entry at all — and a
 * client with no document yet (cold start) must show nothing rather than
 * invent access.
 */

const baseDocument = (capabilities: AccessDocument['capabilities']): AccessDocument => ({
  plan: 'CORE',
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
});

/** The document each Role receives for one unavailable capability. */
const documentFor = (role: Role): AccessDocument =>
  role === 'Owner' || role === 'Manager'
    ? baseDocument({
        'exports.tally': {
          enabled: false,
          title: 'Tally export',
          visibility: 'UPGRADE',
          unavailableMessage: 'Tally export is not available for this Organization.',
          resolution: 'CONTACT_PUMPOS',
        },
      })
    : baseDocument({});

const entitledDocument = baseDocument({
  'exports.tally': { enabled: true, title: 'Tally export' },
});

afterEach(cleanup);

function renderWithAccess(ui: React.ReactNode, access: AccessDocument | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (access) client.setQueryData(queryKeys.access(), access);
  return render(<QueryProvider client={client}>{ui}</QueryProvider>);
}

describe('capabilityState', () => {
  it('reports an entitled capability as enabled', () => {
    expect(capabilityState(entitledDocument, 'exports.tally')).toEqual({
      status: 'enabled',
      title: 'Tally export',
    });
  });

  it('reports a disabled entry as an explainable upgrade', () => {
    expect(capabilityState(documentFor('Owner'), 'exports.tally')).toEqual({
      status: 'upgrade',
      title: 'Tally export',
      message: 'Tally export is not available for this Organization.',
      resolution: 'CONTACT_PUMPOS',
    });
  });

  it('hides a capability this Role was not told about', () => {
    expect(capabilityState(documentFor('Staff'), 'exports.tally')).toEqual({ status: 'hidden' });
  });

  it('hides everything on a cold start with no document', () => {
    expect(capabilityState(undefined, 'exports.tally')).toEqual({ status: 'hidden' });
  });
});

describe('CapabilityGate', () => {
  it('renders the feature when the Organization is entitled', () => {
    renderWithAccess(
      <CapabilityGate capability="exports.tally">
        <button>Export to Tally</button>
      </CapabilityGate>,
      entitledDocument,
    );

    expect(screen.getByText('Export to Tally')).toBeTruthy();
  });

  it.each<Role>(['Owner', 'Manager'])('explains the absence to %s', (role) => {
    renderWithAccess(
      <CapabilityGate capability="exports.tally">
        <button>Export to Tally</button>
      </CapabilityGate>,
      documentFor(role),
    );

    expect(screen.queryByText('Export to Tally')).toBeNull();
    expect(screen.getByText('Tally export is not available for this Organization.')).toBeTruthy();
  });

  it.each<Role>(['Accountant', 'Staff', 'Attendant'])(
    'shows %s nothing at all — no commercial prompt',
    (role) => {
      const { container } = renderWithAccess(
        <CapabilityGate capability="exports.tally">
          <button>Export to Tally</button>
        </CapabilityGate>,
        documentFor(role),
      );

      expect(container.textContent).toBe('');
    },
  );

  it('renders nothing on a cold start rather than assuming access', () => {
    const { container } = renderWithAccess(
      <CapabilityGate capability="exports.tally">
        <button>Export to Tally</button>
      </CapabilityGate>,
      undefined,
    );

    expect(container.textContent).toBe('');
  });

  it('accepts a caller-supplied upgrade slot, e.g. a silently hidden nav entry', () => {
    const { container } = renderWithAccess(
      <CapabilityGate capability="exports.tally" upgrade={null}>
        <button>Export to Tally</button>
      </CapabilityGate>,
      documentFor('Owner'),
    );

    expect(container.textContent).toBe('');
  });
});

describe('CapabilityRoute (a bookmarked gated page)', () => {
  it('renders the page when entitled', () => {
    renderWithAccess(
      <CapabilityRoute capability="exports.tally">
        <h1>Tally export page</h1>
      </CapabilityRoute>,
      entitledDocument,
    );

    expect(screen.getByText('Tally export page')).toBeTruthy();
  });

  it('shows Owners a clear unavailable state, not a generic permission error', () => {
    renderWithAccess(
      <CapabilityRoute capability="exports.tally">
        <h1>Tally export page</h1>
      </CapabilityRoute>,
      documentFor('Owner'),
    );

    expect(screen.queryByText('Tally export page')).toBeNull();
    expect(screen.getByText('Tally export is not available for this Organization.')).toBeTruthy();
  });

  it('shows other Roles a neutral state that leaks no commercial detail', () => {
    renderWithAccess(
      <CapabilityRoute capability="exports.tally">
        <h1>Tally export page</h1>
      </CapabilityRoute>,
      documentFor('Staff'),
    );

    expect(screen.queryByText('Tally export page')).toBeNull();
    expect(screen.getByText('This page is not available for your Organization.')).toBeTruthy();
    expect(screen.queryByText(/Contact PumpOS/i)).toBeNull();
  });
});
