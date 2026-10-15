import { capabilityState, type AccessDocument } from '@pump/shared';

/**
 * How a locked feature is presented (#605), from the role-filtered Access
 * Document. One decision over `capabilityState`, plus the one fact it leaves
 * out: whether a missing entry means "not yours to know about" or "ask".
 *
 *  - `enabled` — the Organization has it.
 *  - `upgrade` — an Owner or Manager: the server sent a disabled entry, so
 *                they may be told the plan and offered Contact us.
 *  - `ask`     — any other Role, the document loaded and no entry: the
 *                feature is locked and an Owner or Manager can enable it. No
 *                plan, no contact: nothing commercial is shown.
 *  - `hidden`  — no document yet (cold start), or an Owner or Manager with no
 *                entry (a capability that is not offered as an upgrade).
 *
 * The server sends the plan key to Owners and Managers only, so its presence
 * is the Role signal, as for station capacity. Presentation only: the API
 * re-checks access on every protected operation.
 */
export type LockedFeatureState =
  | { status: 'enabled' }
  | { status: 'upgrade'; title: string; message: string; plan: string | null }
  | { status: 'ask' }
  | { status: 'hidden' };

export function lockedFeatureState(
  access: AccessDocument | undefined,
  capability: string,
): LockedFeatureState {
  if (!access) return { status: 'hidden' };
  const state = capabilityState(access, capability);
  if (state.status === 'enabled') return { status: 'enabled' };
  if (state.status === 'upgrade') {
    return {
      status: 'upgrade',
      title: state.title,
      message: state.message,
      plan: access.plan ? planName(access.plan) : null,
    };
  }
  return access.plan ? { status: 'hidden' } : { status: 'ask' };
}

/** Whether a nav entry for the feature shows at all, and with a lock. */
export const lockedFeatureVisible = (state: LockedFeatureState): boolean =>
  state.status !== 'hidden';
export const lockedFeatureLocked = (state: LockedFeatureState): boolean =>
  state.status === 'upgrade' || state.status === 'ask';

/** A Product Plan key as words: `CORE` → `Core`. */
export function planName(key: string): string {
  return key
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** The plan line under an Owner's or Manager's locked feature. */
export const lockedPlanLine = (plan: string | null): string =>
  plan ? `Not included in your ${plan} plan.` : 'Not included in your current plan.';

/** What any other Role reads: whom to ask, nothing commercial. */
export const LOCKED_ASK_LINE = 'Ask your Owner or Manager to enable it.';

/**
 * Where "Contact us" goes. No in-app support channel exists yet, so it opens
 * an email to PumpOS.
 * TODO(#605): replace with the real support channel once there is one.
 */
export const PUMPOS_CONTACT_EMAIL = 'support@pumpos.app';
export const pumposContactHref = (feature: string): string =>
  `mailto:${PUMPOS_CONTACT_EMAIL}?subject=${encodeURIComponent(`Enable ${feature}`)}`;
