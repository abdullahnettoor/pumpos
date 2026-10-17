export interface PlanFeatureItem {
  name: string;
  note?: string;
}
export type PlanFeatureRow = PlanFeatureItem | string;

/** Rows every feature page shows for each plan; pages add their own rows after these. */
export const CORE_PLAN_BASE: PlanFeatureRow[] = [
  'Logins: 3 on Core',
  'Attendants without a login, unlimited',
];

export const PRO_PLAN_BASE: PlanFeatureRow[] = [
  'Logins: 10 on Pro',
  'Several stations under one login',
  { name: 'Reports across stations', note: 'Coming next' },
];

export const PRO_PLUS_PLAN_FEATURES: PlanFeatureRow[] = [
  'Unlimited logins',
  'Custom permissions',
  'Attendant Handover Report',
];
