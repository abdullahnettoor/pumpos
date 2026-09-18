export interface SessionBootOptions<TSession> {
  /** Fetches the backend session context — the user's role and display name. */
  loadSession: () => Promise<TSession>;
  /**
   * Warms the stations query. Returns a promise, but the boot deliberately
   * does not wait on it: stations render as skeletons inside an already-visible
   * shell.
   */
  prefetchStations: () => Promise<unknown>;
}

/**
 * Starts the two post-sign-in requests together and resolves on the session one.
 *
 * Previously these ran in series — `await getCurrentSession()` and only then
 * the station list — so a cold sign-in blocked the whole viewport for the sum
 * of both round trips, on connections that are often slow. They are
 * independent: the station list needs the JWT, which is already set, not the
 * resolved role. So both go out at once.
 *
 * Only the session is awaited, because only the session gates the shell: once
 * we know who the user is we can draw their chrome and let stations arrive
 * into skeletons. Awaiting both here would keep the requests parallel but the
 * wait just as long, which misses the point.
 */
export function startSessionBoot<TSession>({
  loadSession,
  prefetchStations,
}: SessionBootOptions<TSession>): Promise<TSession> {
  // Started before the session call and never awaited. Stations failing is not
  // a failed sign-in — the query layer owns retrying it and the UI shows
  // skeletons meanwhile — but an ignored rejection would still surface as an
  // unhandled one, so it is swallowed here rather than left dangling.
  void prefetchStations().catch(() => {});

  return loadSession();
}
