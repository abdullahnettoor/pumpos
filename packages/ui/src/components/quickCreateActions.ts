import type { Role } from '@pump/shared';
import { canOnboardStation } from '@pump/shared';

/** Stable ids for the quick-create actions offered before a station is operational. */
export type PreReadyQuickCreateId = 'onboard-station' | 'team-member';

/**
 * Which quick-create actions to offer on a station that isn't operational yet.
 *
 * Separated from the menu that renders it for two reasons. The obvious one is
 * that a Radix menu cannot be opened reliably under jsdom, so the rule would
 * otherwise ship untested. The better one is that "who may onboard a station"
 * is a permission decision, not a rendering detail, and it had already gone
 * wrong precisely because it lived inside a component nobody could test:
 * "Onboard station" was offered to every role, and the roles that cannot
 * onboard were routed to a page that refused them outside the shell, stranding
 * them without a sign-out (#132).
 *
 * The command palette builds its Actions group from the same list the menu
 * uses, so gating here covers both surfaces at once.
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
