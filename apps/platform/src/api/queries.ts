/**
 * TanStack Query wiring for the platform back-office.
 *
 * Keys are namespaced by API target: the same organization id means different
 * rows on dev and production, and a cache shared across targets would show you
 * one environment's state while you act on another's.
 *
 * Nothing here is persisted. Platform state changes by the admin's own hand,
 * mid-session; a rehydrated cache would show a stale plan seconds after it was
 * changed. Per `AGENTS.md` this is the operational tier — short-lived, in
 * memory only.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './client.js';
import type { ApiTarget } from './targets.js';
import type { AccessChange, InviteResult, OrganizationAccess, OwnerRow } from './types.js';

export const platformKeys = {
  owners: (targetId: string, includeRevoked: boolean) =>
    ['platform', targetId, 'owners', { includeRevoked }] as const,
  access: (targetId: string, orgId: string) => ['platform', targetId, 'access', orgId] as const,
};

/** 15s — the operational tier. Fresh enough to trust, cheap enough to refetch. */
const OPERATIONAL_STALE_MS = 15_000;

export function useOwners(target: ApiTarget, includeRevoked: boolean, enabled: boolean) {
  return useQuery({
    queryKey: platformKeys.owners(target.id, includeRevoked),
    queryFn: () =>
      request<OwnerRow[]>(
        target,
        'GET',
        `/platform/owners${includeRevoked ? '?includeRevoked=1' : ''}`,
      ),
    staleTime: OPERATIONAL_STALE_MS,
    enabled,
  });
}

export function useOrganizationAccess(target: ApiTarget, orgId: string | null) {
  return useQuery({
    queryKey: platformKeys.access(target.id, orgId ?? 'none'),
    queryFn: () =>
      request<OrganizationAccess>(target, 'GET', `/platform/organizations/${orgId}/access`),
    staleTime: OPERATIONAL_STALE_MS,
    enabled: !!orgId,
  });
}

/**
 * Invalidate everything a platform mutation can move.
 *
 * Deliberately blunt: every write here changes either the owners list or an
 * organization's access, most change both (revoke suspends the org; a plan
 * change alters its limits), and the data is a handful of rows. Precision
 * would only create ways to miss one.
 */
export function useInvalidatePlatform(target: ApiTarget) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['platform', target.id] });
  };
}

/**
 * Every mutating action in this app funnels through here, so all of them
 * invalidate and none can forget to.
 */
export function usePlatformMutation<TInput, TResult = AccessChange>(
  target: ApiTarget,
  run: (target: ApiTarget, input: TInput) => Promise<TResult>,
) {
  const invalidate = useInvalidatePlatform(target);
  return useMutation({
    mutationFn: (input: TInput) => run(target, input),
    onSettled: () => invalidate(),
  });
}

// --- The commands, one per CLI verb -----------------------------------------

export interface InviteInput {
  email: string;
  fullName: string;
  organizationName: string;
  /** No-SMTP fallback: provision a verified account and return the password. */
  noEmail: boolean;
  password?: string;
}

export const commands = {
  invite: (target: ApiTarget, input: InviteInput) =>
    request<InviteResult>(target, 'POST', '/platform/owners/invite', {
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName.trim(),
      organizationName: input.organizationName.trim(),
      ...(input.noEmail
        ? { mode: 'password', ...(input.password ? { password: input.password } : {}) }
        : {}),
    }),

  ownerAction: (
    target: ApiTarget,
    input: { orgId: string; verb: 'resend' | 'revoke' | 'deactivate' | 'reactivate' },
  ) => request<unknown>(target, 'POST', `/platform/owners/${input.orgId}/${input.verb}`, {}),

  grantCapability: (target: ApiTarget, input: { orgId: string; key: string; reason?: string }) =>
    request<AccessChange>(target, 'POST', `/platform/organizations/${input.orgId}/capabilities`, {
      capabilityKey: input.key,
      reason: input.reason,
    }),

  revokeCapability: (target: ApiTarget, input: { orgId: string; key: string; reason?: string }) =>
    request<AccessChange>(
      target,
      'DELETE',
      `/platform/organizations/${input.orgId}/capabilities/${encodeURIComponent(input.key)}`,
      { reason: input.reason },
    ),

  setLimit: (
    target: ApiTarget,
    input: { orgId: string; key: string; value: number; reason: string },
  ) =>
    request<AccessChange>(
      target,
      'PUT',
      `/platform/organizations/${input.orgId}/limits/${encodeURIComponent(input.key)}`,
      { value: input.value, reason: input.reason },
    ),

  clearLimit: (target: ApiTarget, input: { orgId: string; key: string; reason?: string }) =>
    request<AccessChange>(
      target,
      'DELETE',
      `/platform/organizations/${input.orgId}/limits/${encodeURIComponent(input.key)}`,
      { reason: input.reason },
    ),

  setPlan: (target: ApiTarget, input: { orgId: string; plan: string; reason?: string }) =>
    request<AccessChange>(target, 'PUT', `/platform/organizations/${input.orgId}/plan`, {
      plan: input.plan,
      reason: input.reason,
    }),

  setSubscription: (
    target: ApiTarget,
    input: { orgId: string; status: string; accessUntil?: string; reason?: string },
  ) =>
    request<AccessChange>(target, 'PUT', `/platform/organizations/${input.orgId}/subscription`, {
      status: input.status,
      // Omitted entirely rather than sent empty: the API reads "absent" as
      // "derive the standard grace window" and an explicit null as "clear it".
      ...(input.accessUntil ? { accessUntil: input.accessUntil } : {}),
      reason: input.reason,
    }),

  confirmPayment: (target: ApiTarget, input: { orgId: string; reason?: string }) =>
    request<AccessChange>(
      target,
      'POST',
      `/platform/organizations/${input.orgId}/subscription/confirm-payment`,
      { reason: input.reason },
    ),

  suspend: (target: ApiTarget, input: { orgId: string; reason: string }) =>
    request<AccessChange>(target, 'POST', `/platform/organizations/${input.orgId}/suspend`, {
      reason: input.reason,
    }),

  restore: (target: ApiTarget, input: { orgId: string; reason: string }) =>
    request<AccessChange>(target, 'POST', `/platform/organizations/${input.orgId}/restore`, {
      reason: input.reason,
    }),
};
