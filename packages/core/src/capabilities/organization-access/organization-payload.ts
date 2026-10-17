import type {
  OrganizationCommercialDetail,
  OrganizationPayload,
  OrganizationProfileMetadata,
  Role,
} from '@pump/shared';
import { seesCommercialAccess } from './resolve-access.js';

type Instant = Date | string;

/** An Organization row as storage returns it. */
export interface OrganizationRecord {
  id: string;
  name: string;
  metadata: unknown;
  subscriptionPlan: string;
  subscriptionStatus: string;
  accessUntil: Instant | null;
  isDemo: boolean;
  demoExpiresAt: Instant | null;
  suspendedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

/** The profile keys a client may read from `organizations.metadata`. */
export const ORGANIZATION_PROFILE_KEYS = [
  'legalName',
  'gstin',
  'pan',
  'stateCode',
  'address',
  'phone',
  'email',
] as const satisfies readonly (keyof OrganizationProfileMetadata)[];

const iso = (value: Instant): string => (value instanceof Date ? value.toISOString() : value);
const isoOrNull = (value: Instant | null): string | null => (value === null ? null : iso(value));

/**
 * Keep only the profile keys from stored metadata, so a key written there for
 * another purpose never reaches a client by default.
 */
export function pickProfileMetadata(metadata: unknown): OrganizationProfileMetadata {
  if (typeof metadata !== 'object' || metadata === null) return {};
  const source = metadata as Record<string, unknown>;
  const picked: OrganizationProfileMetadata = {};
  for (const key of ORGANIZATION_PROFILE_KEYS) {
    const value = source[key];
    if (typeof value === 'string' || value === null) picked[key] = value;
  }
  return picked;
}

function commercialDetail(org: OrganizationRecord): OrganizationCommercialDetail {
  return {
    subscriptionPlan: org.subscriptionPlan,
    subscriptionStatus: org.subscriptionStatus,
    accessUntil: isoOrNull(org.accessUntil),
    isDemo: org.isDemo,
    demoExpiresAt: isoOrNull(org.demoExpiresAt),
    suspendedAt: isoOrNull(org.suspendedAt),
  };
}

/**
 * Shape the Organization for a Role (#616). Every Role gets the profile the
 * UI prints and shows; plan and billing columns go only to the Roles that
 * make purchasing decisions (`seesCommercialAccess`). Filtering happens on
 * the server so a client never holds commercial detail it may not see.
 */
export function shapeOrganizationPayload(org: OrganizationRecord, role: Role): OrganizationPayload {
  const profile = {
    id: org.id,
    name: org.name,
    metadata: pickProfileMetadata(org.metadata),
    createdAt: iso(org.createdAt),
    updatedAt: iso(org.updatedAt),
  };
  return seesCommercialAccess(role) ? { ...profile, ...commercialDetail(org) } : profile;
}
