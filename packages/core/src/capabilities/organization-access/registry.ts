import { ATTENDANT_REPORT_CAPABILITY } from '@pump/shared';
import type { LimitKey, ProductPlanKey, ResolutionCode } from '@pump/shared';

/**
 * Typed access registry (Phase E1).
 *
 * Product Plans, Product Capabilities and Limits are defined in code, not in
 * the database, so a platform administrator can never grant access to
 * behaviour this build does not implement. Register a capability here only
 * once its feature exists.
 */

/** Presentation + resolution metadata for one gated Product Capability. */
export interface ProductCapabilityDefinition {
  key: string;
  /** Customer-facing name, e.g. "Tally export". */
  title: string;
  /** Shown when the Organization is not entitled. */
  unavailableMessage: string;
  /** The next action that would obtain access. */
  resolution: ResolutionCode;
  /**
   * Whether Owners and Managers may see a disabled upgrade entry. When false
   * the capability is simply absent for everyone who lacks it — Staff and
   * Attendants never see upgrade entries regardless.
   */
  upgradable: boolean;
}

/** The Product Capabilities and Limits one commercial package supplies. */
export interface ProductPlanDefinition {
  key: ProductPlanKey;
  capabilities: readonly string[];
  limits: Record<LimitKey, number>;
}

export interface AccessRegistry {
  plans: Record<ProductPlanKey, ProductPlanDefinition>;
  capabilities: Record<string, ProductCapabilityDefinition>;
}

/** Plan assigned to an Organization whose stored plan is missing or unknown. */
export const DEFAULT_PRODUCT_PLAN: ProductPlanKey = 'CORE';

/** The Attendant Handover Report — per-Attendant accountability over a period. */
export { ATTENDANT_REPORT_CAPABILITY } from '@pump/shared';

/**
 * Production registry. `CORE` is the ungated baseline: all existing PumpOS
 * behaviour, one Station.
 *
 * `reports.attendant` is registered but belongs to no plan: until the
 * second-tier Product Plan exists, an Organization obtains it only through an
 * explicit platform capability grant.
 */
export const PRODUCT_ACCESS_REGISTRY: AccessRegistry = {
  plans: {
    CORE: {
      key: 'CORE',
      capabilities: [],
      limits: { station_count: 1 },
    },
  },
  capabilities: {
    [ATTENDANT_REPORT_CAPABILITY]: {
      key: ATTENDANT_REPORT_CAPABILITY,
      title: 'Attendant Handover Report',
      unavailableMessage:
        'The Attendant Handover Report is not part of your current plan. It tracks each attendant’s handovers and variance over a date range.',
      resolution: 'CONTACT_PUMPOS',
      upgradable: true,
    },
  },
};

/** True when `key` names a Product Capability this build implements. */
export function isProductCapabilityKey(
  key: string,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): boolean {
  return Object.prototype.hasOwnProperty.call(registry.capabilities, key);
}

/** True when `key` names a Limit this build enforces. */
export function isLimitKey(key: string): key is LimitKey {
  return key === 'station_count';
}

/**
 * The plan definition for a stored plan value. An unknown or missing plan
 * falls back to `CORE` rather than failing: an Organization must always have a
 * usable baseline, and plan keys are only ever written by PumpOS.
 */
export function resolveProductPlan(
  plan: string | null | undefined,
  registry: AccessRegistry = PRODUCT_ACCESS_REGISTRY,
): ProductPlanDefinition {
  const known = plan ? registry.plans[plan as ProductPlanKey] : undefined;
  return known ?? registry.plans[DEFAULT_PRODUCT_PLAN];
}
