import type { Role } from '@pump/shared';
import { canOnboardStation } from '@pump/shared';

/** Stable ids for the quick-create actions offered before a station is operational. */
export type PreReadyQuickCreateId = 'onboard-station' | 'team-member';

/**
 * Which quick-create actions to offer on a station that isn't operational yet.
 *
 * Both the "+ New" menu and the command palette's Actions group build from this
 * one list, so gating here covers both surfaces and they cannot disagree.
 *
 * Kept out of the component because a Radix menu cannot be opened reliably
 * under jsdom, and this rule shipped untested once already: "Onboard station"
 * was offered to every role, routing the ones it would refuse to a page that
 * dropped them outside the shell without a sign-out (#132).
 */
export function preReadyQuickCreateIds(role: Role): PreReadyQuickCreateId[] {
  const ids: PreReadyQuickCreateId[] = [];
  if (canOnboardStation(role)) ids.push('onboard-station');
  // Inviting the team stays open to everyone: it routes into the shell, where
  // the top bar keeps its sign-out, so it is not a dead end even for a role
  // that can do nothing there.
  ids.push('team-member');
  return ids;
}
