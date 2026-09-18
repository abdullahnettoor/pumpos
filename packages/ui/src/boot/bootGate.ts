import type { Role } from '@pump/shared';

export interface BootGateState {
  /** Whether a Supabase session exists. */
  hasSession: boolean;
  /** A session check or profile resolve is in flight. */
  loading: boolean;
  /** The backend-resolved role. Null until the session call returns. */
  userRole: Role | null;
  /** The profile lookup failed (bad profile, unreachable API, role lockout). */
  profileError: boolean;
  /** The station list has not settled yet — distinct from "came back empty". */
  stationsLoading: boolean;
  /** The selected station is operational. Meaningless while stationsLoading. */
  stationReady: boolean;
  /**
   * Whether a station that is not yet operational takes over the whole page.
   *
   * The two apps genuinely differ here and it is not an oversight: desktop
   * cannot onboard (that is web-console only), so it hands the page to a
   * "finish on the web" notice. The console *is* where onboarding happens, so
   * it keeps a pre-ready station inside the shell and lets the dashboard show
   * a getting-started hero with operational affordances hidden.
   */
  notReadyTakesOver: boolean;
}

/**
 * What to render between pressing Sign In and seeing the app.
 *
 * - `boot`     one branded screen, for the genuine wait before we know the user
 * - `takeover` a full page that owns the viewport: login, an error card with its
 *              sign-out escape hatch, or the onboarding notice
 * - `shell`    the real chrome, with skeletons where data has yet to land
 *
 * Extracted because desktop and console each had their own copy of this
 * decision and had already drifted apart — which is how one of them ended up
 * showing four consecutive screens. The ordering below carries the two rules
 * that are easy to get wrong:
 *
 * 1. A failure outranks "still loading". Otherwise a failed profile lookup sits
 *    on a boot screen that never resolves, and the operator loses the sign-out
 *    button that is their only way out.
 * 2. `stationsLoading` is not `!stationReady`. Treating an unsettled list as
 *    "not onboarded" flashes the onboarding takeover into every sign-in.
 */
export function selectBootGate({
  hasSession,
  loading,
  userRole,
  profileError,
  stationsLoading,
  stationReady,
  notReadyTakesOver,
}: BootGateState): 'boot' | 'takeover' | 'shell' {
  // Rule 1: never strand a failure behind a spinner.
  if (profileError) return 'takeover';

  if (!hasSession) return loading ? 'boot' : 'takeover';

  // One screen for the whole pre-role phase, rather than one per phase.
  if (!userRole) return 'boot';

  // An app that hands a pre-ready station the whole page cannot draw chrome on
  // a list it has not got: it would paint a full operational shell and then
  // destroy it, which is a worse flash than the one this replaced. Keep the
  // single boot screen up instead. The cost is small — the list is static-tier
  // and persisted, so a returning operator already has it, and a cold one waits
  // max(session, stations) where it used to wait the sum.
  if (stationsLoading) return notReadyTakesOver ? 'boot' : 'shell';

  // Rule 2: only a settled list can say the station is not onboarded — and
  // only the apps that hand the page over act on it.
  if (notReadyTakesOver && !stationReady) return 'takeover';

  return 'shell';
}
