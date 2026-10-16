import type { Role } from '@pump/shared';

// --- Auth cache (per-isolate) --------------------------------------------
// Cloudflare Workers reuse isolates across many requests, so a module-level
// Map behaves as a warm per-isolate LRU. This eliminates the 2 DB round-trips
// (users + userStationAssignments) that would otherwise fire on every
// authenticated request — the single biggest source of Hyperdrive queries.
// Identity only (Role, stations): effective Permissions are NEVER cached; the
// auth middleware resolves them on every request (ADR 0013). TTL is short (60s)
// and Role edits also evict the edited user (below).
export type CachedAuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  organizationId: string;
  role: Role;
  assignedStationIds: string[];
};
const AUTH_CACHE_TTL_MS = 60_000;
const AUTH_CACHE_MAX = 500;
const authCache = new Map<string, { user: CachedAuthUser; expiresAt: number }>();

export function getCachedAuthUser(authId: string): CachedAuthUser | null {
  const entry = authCache.get(authId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    authCache.delete(authId);
    return null;
  }
  return entry.user;
}

export function setCachedAuthUser(authId: string, user: CachedAuthUser): void {
  authCache.set(authId, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  if (authCache.size > AUTH_CACHE_MAX) {
    const firstKey = authCache.keys().next().value;
    if (firstKey !== undefined) authCache.delete(firstKey);
  }
}

/**
 * Drop one user's cached principal so their next request re-reads Role and
 * stations. Called after a Role change. Per-isolate: other isolates still expire within the TTL.
 */
export function evictCachedAuthUser(authId: string | null | undefined): void {
  if (authId) authCache.delete(authId);
}
