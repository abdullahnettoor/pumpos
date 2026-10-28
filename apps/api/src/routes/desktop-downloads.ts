import { Hono } from 'hono';
import {
  createDesktopDownloadsService,
  fetchGithubReleases,
  type DesktopDownloadsService,
} from '../services/desktop-downloads.js';

const defaultService = createDesktopDownloadsService(fetchGithubReleases);

/**
 * GET /api/desktop-downloads — per-platform desktop installers resolved from
 * GitHub Releases. Authenticated (mounted under /api), read-only, not tenant
 * data, so it sits outside TENANT_ROUTERS and needs no Restricted Access policy.
 */
export function createDesktopDownloadsRouter(service: DesktopDownloadsService = defaultService) {
  const router = new Hono();
  router.get('/', async (c) => {
    try {
      return c.json({ success: true, data: await service.get() });
    } catch {
      return c.json(
        {
          success: false,
          error: {
            code: 'DOWNLOADS_UNAVAILABLE',
            message: 'Desktop downloads are temporarily unavailable. Try again shortly.',
          },
        },
        503,
      );
    }
  });
  return router;
}

export const desktopDownloadsRouter = createDesktopDownloadsRouter();
