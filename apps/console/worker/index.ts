/**
 * Console edge Worker — mobile gate.
 *
 * The PumpOS console is a desktop-first operational SPA. On phones we don't
 * want to ship the whole bundle; instead we bounce the visitor to the
 * owner-focused mobile PWA (`m.<same-zone>`). This Worker runs *before* the
 * static assets (see `run_worker_first` in wrangler.toml) so the decision is
 * made at the edge without downloading the app shell.
 *
 * Bypass: append `?desktop=1` (sets a cookie) to force the desktop app on a
 * mobile device — useful for on-device debugging.
 */

interface Env {
  ASSETS: Fetcher;
}

const MOBILE_UA =
  /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i;

const BYPASS_COOKIE = 'pumpos_force_desktop=1';

/** Map a console hostname to its sibling mobile hostname. */
function mobileHostFor(hostname: string): string {
  // console.pumpos.app          -> m.pumpos.app
  // console.pumpos.abdullah….com -> m.pumpos.abdullah….com
  if (hostname.startsWith('console.')) {
    return 'm.' + hostname.slice('console.'.length);
  }
  // Apex/dev fallbacks (e.g. dev-pumpos-console.<sub>.workers.dev) have no
  // sibling mobile host; keep the visitor on the desktop app.
  return hostname;
}

function isMobileRequest(request: Request): boolean {
  // Prefer the Client Hint when the browser sends it.
  const chMobile = request.headers.get('Sec-CH-UA-Mobile');
  if (chMobile === '?1') return true;
  if (chMobile === '?0') return false;
  const ua = request.headers.get('User-Agent') ?? '';
  return MOBILE_UA.test(ua);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cookies = request.headers.get('Cookie') ?? '';
    const forcedDesktop =
      url.searchParams.get('desktop') === '1' || cookies.includes(BYPASS_COOKIE);

    if (!forcedDesktop && isMobileRequest(request)) {
      const mobileHost = mobileHostFor(url.hostname);
      if (mobileHost !== url.hostname) {
        const target = `https://${mobileHost}/`;
        return new Response(null, {
          status: 302,
          headers: {
            Location: target,
            'Cache-Control': 'no-store',
            Vary: 'Sec-CH-UA-Mobile, User-Agent',
          },
        });
      }
      // No sibling mobile host configured (dev/workers.dev): fall through and
      // let the in-app gate handle it.
    }

    // Set the bypass cookie so a forced-desktop session persists across
    // navigations without re-appending the query param.
    if (url.searchParams.get('desktop') === '1') {
      const assetResponse = await env.ASSETS.fetch(request);
      const res = new Response(assetResponse.body, assetResponse);
      res.headers.append(
        'Set-Cookie',
        `${BYPASS_COOKIE}; Path=/; Max-Age=86400; SameSite=Lax`,
      );
      return res;
    }

    return env.ASSETS.fetch(request);
  },
};
