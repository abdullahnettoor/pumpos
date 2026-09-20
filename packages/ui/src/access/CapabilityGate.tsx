import React from 'react';
import { Lock } from 'lucide-react';
import { capabilityState, type CapabilityState } from '@pump/shared';
import { useAccess } from '../query/hooks.js';
import { Banner } from '../components/primitives/Banner.js';

/**
 * Client-side Product Capability gates.
 *
 * These decide presentation only — what to render, and what to say when the
 * Organization does not have something. The API re-checks access on every
 * protected operation, so a stale or tampered client changes nothing about
 * what actually happens.
 *
 * Three call sites, one decision (`capabilityState`), so a navigation entry, a
 * button and a whole route can never disagree about the same capability.
 */

/** Resolve one capability's presentation state from the cached Access Document. */
export function useCapability(capability: string): CapabilityState {
  const { data: access } = useAccess();
  return capabilityState(access, capability);
}

export interface CapabilityGateProps {
  capability: string;
  /** Rendered when the Organization has the capability. */
  children: React.ReactNode;
  /**
   * Rendered instead when it is unavailable but this user may be told how to
   * obtain it. Omit to render the standard explanation; pass `null` to render
   * nothing at all (e.g. for a nav entry that should simply disappear).
   */
  upgrade?: React.ReactNode | null;
}

/**
 * Render `children` only when the Organization is entitled. Unavailable and
 * explainable renders the upgrade state; unavailable and not this user's
 * concern — or access not yet known, as on a cold start — renders nothing.
 */
export const CapabilityGate: React.FC<CapabilityGateProps> = ({
  capability,
  children,
  upgrade,
}) => {
  const state = useCapability(capability);
  if (state.status === 'enabled') return <>{children}</>;
  if (state.status === 'hidden') return null;
  if (upgrade !== undefined) return <>{upgrade}</>;
  return <CapabilityUnavailable state={state} />;
};

export interface CapabilityUnavailableProps {
  state: Extract<CapabilityState, { status: 'upgrade' }>;
}

/** Inline explanation of an unavailable capability, with the next action. */
export const CapabilityUnavailable: React.FC<CapabilityUnavailableProps> = ({ state }) => (
  <Banner severity="info" title={state.title} icon={<Lock size={15} />}>
    {state.message}
  </Banner>
);

export interface CapabilityRouteProps {
  capability: string;
  children: React.ReactNode;
}

/**
 * Whole-route gate for a bookmarked or deep-linked page. An unavailable
 * capability renders a clear, self-explanatory state — never a generic
 * permission error, and never a blank screen.
 *
 * A Role that is not told about the capability still gets the neutral
 * unavailable copy: it must not leak that a commercial upgrade exists.
 */
export const CapabilityRoute: React.FC<CapabilityRouteProps> = ({ capability, children }) => {
  const state = useCapability(capability);
  if (state.status === 'enabled') return <>{children}</>;

  return (
    <div style={{ padding: '24px', maxWidth: '640px' }}>
      {state.status === 'upgrade' ? (
        <CapabilityUnavailable state={state} />
      ) : (
        <Banner severity="info" title="Not available" icon={<Lock size={15} />}>
          This page is not available for your Organization.
        </Banner>
      )}
    </div>
  );
};
